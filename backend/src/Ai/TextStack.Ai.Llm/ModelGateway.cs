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
    IModelRouteProvider routeProvider,
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
        // Precedence: registry Primary (table-driven, set by admin promote/rollback) →
        // config Ai:Routes:{feature} → Ai:DefaultProvider → "openai". The route provider
        // is hot-path safe (cached, never throws → null on any failure), so a missing DB
        // or empty registry transparently falls through to the config route below.
        var registryKey = RegistryKey(featureTag);
        var configKey = !string.IsNullOrWhiteSpace(featureTag)
            ? config[$"Ai:Routes:{featureTag}"]
            : null;
        var key = registryKey ?? configKey ?? config["Ai:DefaultProvider"] ?? "openai";

        // A registry row may name a provider key with no keyed registration (e.g. a key
        // renamed in config but still recorded in `models`). That must NEVER throw — fall
        // back to the config route + log, mirroring an unknown-key first-deploy guard.
        var svc = serviceProvider.GetKeyedService<ILlmService>(key);
        if (svc is null)
        {
            logger.LogWarning(
                "Unknown provider key '{Key}' for feature '{Feature}'; falling back to config route", key, featureTag);
            key = configKey ?? config["Ai:DefaultProvider"] ?? "openai";
            svc = serviceProvider.GetRequiredKeyedService<ILlmService>(key);
        }
        return svc;
    }

    /// <summary>Resolved PRIMARY provider key for a feature (registry → config → default),
    /// mirroring <see cref="Route"/>'s precedence WITHOUT touching DI. Used to skip a
    /// shadow that now points at the same provider as the primary.</summary>
    private string ResolvedPrimaryKey(string? featureTag)
    {
        var registryKey = RegistryKey(featureTag);
        var configKey = !string.IsNullOrWhiteSpace(featureTag)
            ? config[$"Ai:Routes:{featureTag}"]
            : null;
        return registryKey ?? configKey ?? config["Ai:DefaultProvider"] ?? "openai";
    }

    /// <summary>Registry Primary key for a feature, defensively. The provider contract is
    /// never-throws, but we ALSO guard here so a misbehaving provider can never break a real
    /// LLM call — it just falls through to the config route.</summary>
    private string? RegistryKey(string? featureTag)
    {
        if (string.IsNullOrWhiteSpace(featureTag))
            return null;
        try
        {
            return routeProvider.PrimaryProviderKey(featureTag);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Registry route lookup threw for feature '{Feature}'; using config route", featureTag);
            return null;
        }
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

        // Post-promotion guard: if the shadow route now points at the SAME provider the
        // primary already resolves to (e.g. the shadow candidate got promoted), shadowing
        // would compare a model to itself + burn paid calls for nothing. Skip it.
        if (string.Equals(shadowKey, ResolvedPrimaryKey(request.FeatureTag), StringComparison.Ordinal))
        {
            logger.LogDebug(
                "Shadow key '{Key}' equals the primary for feature '{Feature}'; skipping self-shadow",
                shadowKey, request.FeatureTag);
            return;
        }

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
                    ComputePromptHash(request), userId: null, shadowProviderKey: shadowKey);

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
        LlmResponse shadow, long shadowMs, string promptHash, Guid? userId,
        string shadowProviderKey = "") =>
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
            CreatedAt: DateTimeOffset.UtcNow,
            ShadowProviderKey: shadowProviderKey);

    /// <summary>Same prompt-hash scheme as the TracingDecorator (system prompt + messages JSON).</summary>
    public static string ComputePromptHash(LlmRequest request)
    {
        var messagesJson = JsonSerializer.Serialize(request.Messages);
        var bytes = Encoding.UTF8.GetBytes($"{request.SystemPrompt}\n{messagesJson}");
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
