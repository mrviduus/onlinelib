using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace TextStack.Ai.Llm;

/// <summary>
/// Composite <see cref="ILlmService"/> that routes each call to a provider by
/// <c>FeatureTag</c> (config <c>Ai:Routes:{featureTag}</c> → provider key, falling
/// back to <c>Ai:DefaultProvider</c>). Resolves the *decorated* keyed instance, so
/// tracing already wraps the provider. Callers never know which model answered.
///
/// v2 (AI-075): optional SHADOW routing. When a feature has a shadow route
/// (<c>Ai:Shadow:Routes:{featureTag}</c>) and the call is sampled, the gateway —
/// AFTER the primary response is ready — fires a fire-and-forget shadow call against
/// the shadow provider's <c>-raw</c> (untraced) sibling and persists one
/// <see cref="Core.ShadowRun"/> row. Shadow NEVER affects the primary call's latency
/// or correctness: the primary returns immediately, the shadow runs on a background
/// scope with its own timeout, and any shadow failure/timeout is swallowed + logged.
/// </summary>
public sealed class ModelGateway(
    IServiceProvider serviceProvider,
    IConfiguration config,
    IServiceScopeFactory scopeFactory,
    ShadowOptions shadowOptions,
    ILogger<ModelGateway> logger) : ILlmService
{
    public async Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var primary = await Route(request.FeatureTag).CompleteAsync(request, ct);
        sw.Stop();

        // Fire-and-forget — never awaited, so the primary returns instantly.
        MaybeShadow(request, primary, sw.ElapsedMilliseconds);
        return primary;
    }

    // Streamed primary is re-yielded unchanged & in order. The shadow (a non-streamed
    // CompleteAsync) only fires AFTER the primary stream completes cleanly; if the
    // primary stream throws mid-way, no shadow runs. The user only ever sees the
    // primary stream.
    public async IAsyncEnumerable<LlmDelta> StreamAsync(
        LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var text = new StringBuilder();
        var toolCalls = new List<ToolCall>();
        LlmUsage? usage = null;
        string? modelId = null;
        var traceId = Guid.NewGuid();

        await using var e = Route(request.FeatureTag).StreamAsync(request, ct).GetAsyncEnumerator(ct);
        while (true)
        {
            if (!await e.MoveNextAsync())
                break;
            var delta = e.Current;

            if (delta.TextDelta is not null) text.Append(delta.TextDelta);
            if (delta.ToolCallDelta is not null) toolCalls.Add(delta.ToolCallDelta);
            if (delta.FinalUsage is not null) usage = delta.FinalUsage;
            if (delta.ModelId is not null) modelId = delta.ModelId;
            yield return delta;
        }

        sw.Stop();
        // Only reached on clean completion (an exception escapes the loop without
        // running this), so a primary that throws mid-stream is never shadowed.
        var primary = TracingDecorator.BuildStreamedResponse(text.ToString(), toolCalls, usage, modelId, traceId);
        MaybeShadow(request, primary, sw.ElapsedMilliseconds);
    }

    private ILlmService Route(string? featureTag)
    {
        string? key = null;
        if (!string.IsNullOrWhiteSpace(featureTag))
        {
            key = config[$"Ai:Routes:{featureTag}"];
            if (key is null)
                logger.LogDebug("No Ai:Routes entry for feature '{Feature}'; using default provider", featureTag);
        }
        key ??= config["Ai:DefaultProvider"] ?? "openai";
        return serviceProvider.GetRequiredKeyedService<ILlmService>(key);
    }

    /// <summary>
    /// If a shadow route is configured for the feature and the call is sampled, run the
    /// shadow on a background scope and persist one row. Fully fire-and-forget: the task
    /// is never awaited, every failure is swallowed + logged, and the user's
    /// CancellationToken is NOT threaded (the shadow uses its own timeout).
    /// </summary>
    private void MaybeShadow(LlmRequest request, LlmResponse primary, long primaryLatencyMs)
    {
        var shadowKey = shadowOptions.ShadowKeyFor(request.FeatureTag);
        if (shadowKey is null)
            return;
        if (!ShouldSample(shadowOptions.RateFor(request.FeatureTag)))
            return;

        var feature = string.IsNullOrWhiteSpace(request.FeatureTag) ? "unknown" : request.FeatureTag;
        var timeout = TimeSpan.FromSeconds(shadowOptions.TimeoutSeconds);

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                // Resolve the -raw (UNTRACED) sibling: no llm_traces row, no recursion
                // through the gateway, and the cost is owned by this shadow row only.
                var shadow = scope.ServiceProvider.GetRequiredKeyedService<ILlmService>($"{shadowKey}-raw");

                using var cts = new CancellationTokenSource(timeout);
                var sw = Stopwatch.StartNew();
                var shadowResponse = await shadow.CompleteAsync(request, cts.Token);
                sw.Stop();

                // LlmRequest carries no caller identity today; UserId is reserved for when
                // the gateway threads one (mirrors how LlmTrace.UserId is currently null).
                var run = BuildShadowRun(
                    feature, primary, primaryLatencyMs, shadowResponse, sw.ElapsedMilliseconds,
                    ComputePromptHash(request), userId: null);

                var writer = scope.ServiceProvider.GetRequiredService<IShadowRunWriter>();
                await writer.WriteAsync(run, CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Shadow run failed for feature '{Feature}' (shadow key '{Key}')", feature, shadowKey);
            }
        });
    }

    // ---- pure, deterministic helpers (unit-tested directly) ----

    /// <summary>Sample a shadow run by rate. Deliberately NOT coupled to the tracing
    /// sampler — shadow has its own (paid) economics.</summary>
    public static bool ShouldSample(double rate)
    {
        if (rate >= 1.0) return true;
        if (rate <= 0.0) return false;
        return Random.Shared.NextDouble() < rate;
    }

    /// <summary>
    /// Build a redacted <see cref="Core.ShadowRun"/> from a primary + shadow response.
    /// Both response texts are PII-scrubbed with the SAME redactor the TracingDecorator
    /// uses, BEFORE the row is constructed.
    /// </summary>
    public static Core.ShadowRun BuildShadowRun(
        string featureTag, LlmResponse primary, long primaryMs,
        LlmResponse shadow, long shadowMs, string promptHash, Guid? userId) =>
        new(
            Id: Guid.NewGuid(),
            FeatureTag: featureTag,
            PrimaryModelId: primary.ModelId,
            ShadowModelId: shadow.ModelId,
            PrimaryResponse: TraceRedactor.Redact(primary.Text),
            ShadowResponse: TraceRedactor.Redact(shadow.Text),
            PrimaryLatencyMs: (int)Math.Min(primaryMs, int.MaxValue),
            ShadowLatencyMs: (int)Math.Min(shadowMs, int.MaxValue),
            PrimaryCostUsd: primary.Usage.CostUsd,
            ShadowCostUsd: shadow.Usage.CostUsd,
            PrimaryTokensIn: primary.Usage.InputTokens,
            PrimaryTokensOut: primary.Usage.OutputTokens,
            ShadowTokensIn: shadow.Usage.InputTokens,
            ShadowTokensOut: shadow.Usage.OutputTokens,
            PrimaryTraceId: primary.TraceId,
            ShadowTraceId: shadow.TraceId,
            PromptHash: promptHash,
            UserId: userId,
            CreatedAt: DateTimeOffset.UtcNow);

    /// <summary>Same prompt-hash scheme as the TracingDecorator (system prompt + messages JSON).</summary>
    public static string ComputePromptHash(LlmRequest request)
    {
        var messagesJson = JsonSerializer.Serialize(request.Messages);
        var bytes = Encoding.UTF8.GetBytes($"{request.SystemPrompt}\n{messagesJson}");
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
