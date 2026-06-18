using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

/// <summary>
/// Shadow-routing behaviour for ModelGateway v2 (AI-075). The contract under test:
/// shadow NEVER affects the primary call (latency/correctness), resolves the
/// <c>-raw</c> (untraced) provider, and any shadow failure/timeout is swallowed.
/// Background-fire tests gate on the writer's TaskCompletionSource — never Thread.Sleep.
/// </summary>
public class ModelGatewayShadowTests
{
    private static LlmRequest Req(string? feature = "explain") =>
        new("system prompt", new[] { new LlmMessage("user", "hello") }, 100, FeatureTag: feature);

    private static LlmResponse Resp(string text, string model = "primary-model") =>
        new(text, Array.Empty<ToolCall>(), new LlmUsage(10, 5, 0.0001m), model, Guid.NewGuid());

    // ---- ShouldSample (deterministic boundaries) ----

    [Theory]
    [InlineData(1.0, true)]
    [InlineData(0.0, false)]
    public void ShouldSample_Boundaries_Deterministic(double rate, bool expected) =>
        Assert.Equal(expected, ModelGateway.ShouldSample(rate));

    // ---- ShadowOptions routing/rate ----

    [Fact]
    public void ShadowKeyFor_Unconfigured_ReturnsNull()
    {
        var opts = new ShadowOptions(0.0, new Dictionary<string, string>(), null, 15);
        Assert.Null(opts.ShadowKeyFor("explain"));
        Assert.Null(opts.ShadowKeyFor(null));
    }

    [Fact]
    public void ShadowKeyFor_Configured_ReturnsKey()
    {
        var opts = new ShadowOptions(0.0,
            new Dictionary<string, string> { ["explain"] = "openai-explain" }, null, 15);
        Assert.Equal("openai-explain", opts.ShadowKeyFor("explain"));
    }

    [Fact]
    public void RateFor_PerFeatureOverride_BeatsDefault()
    {
        var opts = new ShadowOptions(
            DefaultSampleRate: 0.0,
            Routes: new Dictionary<string, string> { ["explain"] = "openai-explain" },
            PerFeatureRates: new Dictionary<string, double> { ["explain"] = 1.0 },
            TimeoutSeconds: 15);
        Assert.Equal(1.0, opts.RateFor("explain")); // overridden
        Assert.Equal(0.0, opts.RateFor("translate")); // default
    }

    // ---- BuildShadowRun (maps + redacts) ----

    [Fact]
    public void BuildShadowRun_MapsFields_AndRedactsBothResponses()
    {
        var primary = Resp("primary says reach me at john.doe@example.com", "gpt-4.1-mini");
        var shadow = Resp("shadow says mail jane@example.org now", "gpt-4.1-nano");

        var run = ModelGateway.BuildShadowRun(
            "explain", primary, primaryMs: 42, shadow, shadowMs: 99,
            promptHash: "abc123", userId: null);

        Assert.Equal("explain", run.FeatureTag);
        Assert.Equal("gpt-4.1-mini", run.PrimaryModelId);
        Assert.Equal("gpt-4.1-nano", run.ShadowModelId);
        Assert.Equal(42, run.PrimaryLatencyMs);
        Assert.Equal(99, run.ShadowLatencyMs);
        Assert.Equal(primary.Usage.CostUsd, run.PrimaryCostUsd);
        Assert.Equal(10, run.ShadowTokensIn);
        Assert.Equal(5, run.ShadowTokensOut);
        Assert.Equal(primary.TraceId, run.PrimaryTraceId);
        Assert.Equal(shadow.TraceId, run.ShadowTraceId);
        Assert.Equal("abc123", run.PromptHash);

        // Both responses scrubbed of email.
        Assert.DoesNotContain("john.doe@example.com", run.PrimaryResponse);
        Assert.DoesNotContain("jane@example.org", run.ShadowResponse);
        Assert.Contains("[redacted-email]", run.PrimaryResponse);
        Assert.Contains("[redacted-email]", run.ShadowResponse);
    }

    // ---- CompleteAsync: shadow NOT invoked when unconfigured ----

    [Fact]
    public async Task CompleteAsync_NoShadowRoute_WriterNeverCalled()
    {
        var writer = new FakeShadowRunWriter();
        var shadow = new RecordingLlm(Resp("shadow"));
        var gateway = Build(
            primary: new RecordingLlm(Resp("primary")),
            shadow: shadow, writer: writer,
            shadowOpts: new ShadowOptions(1.0, new Dictionary<string, string>(), null, 15));

        var result = await gateway.CompleteAsync(Req(), CancellationToken.None);

        Assert.Equal("primary", result.Text);
        await Task.Delay(50, TestContext.Current.CancellationToken); // give any (wrongly) scheduled task a chance
        Assert.False(writer.Written.Task.IsCompleted);
        Assert.Equal(0, shadow.CallCount);
    }

    // ---- CompleteAsync: configured + sampled → shadow runs, resolves -raw, one row ----

    [Fact]
    public async Task CompleteAsync_ShadowConfigured_ResolvesRawKey_AndWritesOneRow()
    {
        var writer = new FakeShadowRunWriter();
        var rawShadow = new RecordingLlm(Resp("shadow answer", "shadow-model"));
        var gateway = Build(
            primary: new RecordingLlm(Resp("primary answer")),
            shadow: rawShadow, writer: writer, sampleRate: 1.0);

        var result = await gateway.CompleteAsync(Req(), CancellationToken.None);
        Assert.Equal("primary answer", result.Text);

        var run = await writer.Written.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        Assert.Equal("primary answer", run.PrimaryResponse);
        Assert.Equal("shadow answer", run.ShadowResponse);
        Assert.Equal("shadow-model", run.ShadowModelId);
        Assert.Equal(1, rawShadow.CallCount);   // shadow ran exactly once
        Assert.Equal(1, writer.WriteCount);     // one row
        // The shadow resolved the "-raw" keyed service (asserted via the key the DI saw).
        Assert.Contains("openai-explain-raw", RequestedKeys);
    }

    // ---- shadow failure is swallowed; primary intact ----

    [Fact]
    public async Task CompleteAsync_ShadowThrows_PrimaryUnaffected_NoThrow()
    {
        var writer = new FakeShadowRunWriter();
        var gateway = Build(
            primary: new RecordingLlm(Resp("primary ok")),
            shadow: new ThrowingLlm(),
            writer: writer, sampleRate: 1.0);

        var result = await gateway.CompleteAsync(Req(), CancellationToken.None);

        Assert.Equal("primary ok", result.Text);     // primary correct
        await Task.Delay(100, TestContext.Current.CancellationToken);
        Assert.False(writer.Written.Task.IsCompleted); // shadow threw → no row, no surfaced error
    }

    // ---- shadow timeout swallowed; primary returns immediately ----

    [Fact]
    public async Task CompleteAsync_ShadowTimesOut_Swallowed_PrimaryImmediate()
    {
        var writer = new FakeShadowRunWriter();
        // Shadow blocks ~1s but the gateway shadow timeout is 0s → OCE swallowed.
        var gateway = Build(
            primary: new RecordingLlm(Resp("primary fast")),
            shadow: new DelayingLlm(TimeSpan.FromSeconds(1), Resp("late shadow")),
            writer: writer, sampleRate: 1.0, timeoutSeconds: 0);

        var result = await gateway.CompleteAsync(Req(), CancellationToken.None);
        Assert.Equal("primary fast", result.Text);

        await Task.Delay(150, TestContext.Current.CancellationToken);
        Assert.False(writer.Written.Task.IsCompleted); // timed-out shadow writes nothing
    }

    // ---- primary latency unaffected: primary returns before a blocked shadow's write ----

    [Fact]
    public async Task CompleteAsync_PrimaryReturns_BeforeBlockedShadowWrites()
    {
        // Writer blocks until we release it; if the primary path awaited the shadow,
        // CompleteAsync would hang. It must return regardless.
        var writer = new FakeShadowRunWriter(blockUntilReleased: true);
        var gateway = Build(
            primary: new RecordingLlm(Resp("primary now")),
            shadow: new RecordingLlm(Resp("shadow")),
            writer: writer, sampleRate: 1.0);

        var result = await gateway.CompleteAsync(Req(), CancellationToken.None);
        Assert.Equal("primary now", result.Text); // returned with shadow write still blocked

        Assert.False(writer.Written.Task.IsCompleted);
        writer.Release();
        await writer.Written.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
    }

    // ---- invariant #6: shadow gets its OWN ct (None + timeout), NOT the caller's ----

    [Fact]
    public async Task CompleteAsync_CallerCtAlreadyCancelled_ShadowStillRuns_WithOwnToken()
    {
        // The caller's ct is cancelled the instant the primary returns. If the gateway
        // (wrongly) threaded the caller ct into the shadow, the shadow's CompleteAsync
        // would observe IsCancellationRequested. It must NOT — shadow uses CT.None+timeout.
        var writer = new FakeShadowRunWriter();
        var capturing = new CtCapturingLlm(Resp("shadow ok", "shadow-model"));
        var gateway = Build(
            primary: new RecordingLlm(Resp("primary ok")),
            shadow: capturing, writer: writer, sampleRate: 1.0);

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // caller token is ALREADY cancelled

        // Primary stub ignores ct, so the primary call still completes.
        var result = await gateway.CompleteAsync(Req(), cts.Token);
        Assert.Equal("primary ok", result.Text);

        var run = await writer.Written.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        Assert.Equal("shadow ok", run.ShadowResponse);
        Assert.Equal(1, writer.WriteCount);
        // The token the shadow actually saw was NOT cancellation-requested at call time.
        Assert.False(capturing.SawCancelledToken);
        // ...and it was a different token than the caller's (own CTS, not caller's).
        Assert.NotEqual(cts.Token, capturing.SeenToken);
    }

    // ---- shadow self-skip: shadow key == resolved primary key → no shadow ----

    [Fact]
    public async Task MaybeShadow_ShadowKeyEqualsPrimaryKey_SkipsShadow()
    {
        // Registry promotes explain's primary to "openai-explain" — the SAME provider the
        // shadow route points at. Shadowing would compare a model to itself; the gateway skips.
        var writer = new FakeShadowRunWriter();
        var rawShadow = new RecordingLlm(Resp("shadow"));
        var primary = new RecordingLlm(Resp("primary"));

        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Ai:DefaultProvider"] = "openai",
                ["Ai:Routes:explain"] = "openai",
            })
            .Build();

        var services = new ServiceCollection();
        // Registry routes explain → "openai-explain", so the primary resolves that keyed svc.
        services.AddKeyedSingleton<ILlmService>("openai-explain", primary);
        services.AddKeyedSingleton<ILlmService>("openai-explain-raw", rawShadow);
        services.AddScoped<IShadowRunWriter>(_ => writer);
        var inner = services.BuildServiceProvider();
        var spy = new KeyRecordingProvider(inner, RequestedKeys);

        var opts = new ShadowOptions(
            DefaultSampleRate: 1.0,
            Routes: new Dictionary<string, string> { ["explain"] = "openai-explain" },
            PerFeatureRates: null,
            TimeoutSeconds: 15);
        var routes = new StubRouteProvider(new() { ["explain"] = "openai-explain" });

        var gateway = new ModelGateway(spy, cfg, spy.ScopeFactory, opts, routes, NullLogger<ModelGateway>.Instance);

        var result = await gateway.CompleteAsync(Req(), CancellationToken.None);
        Assert.Equal("primary", result.Text);

        await Task.Delay(50, TestContext.Current.CancellationToken);
        Assert.False(writer.Written.Task.IsCompleted); // self-shadow skipped → no row
        Assert.Equal(0, rawShadow.CallCount);
    }

    // ---- StreamAsync edge: empty stream still fires exactly one shadow on clean end ----

    [Fact]
    public async Task StreamAsync_EmptyStream_StillShadowsOnce_WithEmptyPrimaryResponse()
    {
        var writer = new FakeShadowRunWriter();
        var rawShadow = new RecordingLlm(Resp("shadow"));
        var gateway = Build(
            primary: new StreamingStub(Array.Empty<LlmDelta>()),
            shadow: rawShadow, writer: writer, sampleRate: 1.0);

        var seen = new List<LlmDelta>();
        await foreach (var d in gateway.StreamAsync(Req(), TestContext.Current.CancellationToken))
            seen.Add(d);

        Assert.Empty(seen);
        var run = await writer.Written.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        Assert.Equal("", run.PrimaryResponse);
        Assert.Equal(1, rawShadow.CallCount);
        Assert.Equal(1, writer.WriteCount);
    }

    // ---- StreamAsync: deltas re-yielded unchanged & ordered; exactly one shadow after clean end ----

    [Fact]
    public async Task StreamAsync_ReYieldsDeltas_AndShadowsOnceAfterCleanCompletion()
    {
        var deltas = new[]
        {
            new LlmDelta(TextDelta: "Hel"),
            new LlmDelta(TextDelta: "lo"),
            new LlmDelta(FinalUsage: new LlmUsage(5, 2, 0.001m), ModelId: "stream-model"),
        };
        var writer = new FakeShadowRunWriter();
        var rawShadow = new RecordingLlm(Resp("shadow stream"));
        var gateway = Build(
            primary: new StreamingStub(deltas),
            shadow: rawShadow, writer: writer, sampleRate: 1.0);

        var seen = new List<LlmDelta>();
        await foreach (var d in gateway.StreamAsync(Req(), TestContext.Current.CancellationToken))
            seen.Add(d);

        Assert.Equal(deltas, seen); // unchanged & in order

        var run = await writer.Written.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        Assert.Equal("Hello", run.PrimaryResponse);
        Assert.Equal("stream-model", run.PrimaryModelId);
        Assert.Equal(1, rawShadow.CallCount);
        Assert.Equal(1, writer.WriteCount);
    }

    [Fact]
    public async Task StreamAsync_PrimaryThrowsMidStream_NoShadow()
    {
        var writer = new FakeShadowRunWriter();
        var rawShadow = new RecordingLlm(Resp("shadow"));
        var gateway = Build(
            primary: new ThrowingStreamStub(),
            shadow: rawShadow, writer: writer, sampleRate: 1.0);

        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            await foreach (var _ in gateway.StreamAsync(Req(), TestContext.Current.CancellationToken)) { }
        });

        await Task.Delay(100, TestContext.Current.CancellationToken);
        Assert.Equal(0, rawShadow.CallCount);
        Assert.False(writer.Written.Task.IsCompleted);
    }

    // ---- harness ----

    // Per-test record of which keyed services were requested (asserts "-raw" resolution).
    private readonly ConcurrentBag<string> RequestedKeys = new();

    private ModelGateway Build(
        ILlmService primary, ILlmService shadow, FakeShadowRunWriter writer,
        double sampleRate = 1.0, int timeoutSeconds = 15, ShadowOptions? shadowOpts = null,
        IModelRouteProvider? routeProvider = null)
    {
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Ai:DefaultProvider"] = "openai",
                ["Ai:Routes:explain"] = "openai", // primary route key
            })
            .Build();

        var services = new ServiceCollection();
        // Primary decorated provider (gateway routes "explain" → "openai").
        services.AddKeyedSingleton<ILlmService>("openai", primary);
        // Shadow resolves the "-raw" sibling of the configured shadow key.
        services.AddKeyedSingleton<ILlmService>("openai-explain-raw", shadow);
        services.AddScoped<IShadowRunWriter>(_ => writer);
        var inner = services.BuildServiceProvider();

        // Wrap the provider so we can observe which keyed services the gateway requests.
        var spy = new KeyRecordingProvider(inner, RequestedKeys);

        var opts = shadowOpts ?? new ShadowOptions(
            DefaultSampleRate: sampleRate,
            Routes: new Dictionary<string, string> { ["explain"] = "openai-explain" },
            PerFeatureRates: null,
            TimeoutSeconds: timeoutSeconds);

        var routes = routeProvider ?? new StubRouteProvider();
        return new ModelGateway(spy, cfg, spy.ScopeFactory, opts, routes, NullLogger<ModelGateway>.Instance);
    }

    /// <summary>Registry route provider returning a fixed map (empty = no registry hit).</summary>
    private sealed class StubRouteProvider(Dictionary<string, string>? routes = null) : IModelRouteProvider
    {
        private readonly Dictionary<string, string> _routes = routes ?? new();
        public string? PrimaryProviderKey(string featureTag) =>
            _routes.TryGetValue(featureTag, out var k) ? k : null;
        public void Invalidate() { }
    }

    // ---- fakes ----

    private sealed class FakeShadowRunWriter(bool blockUntilReleased = false) : IShadowRunWriter
    {
        public TaskCompletionSource<ShadowRun> Written { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _writeCount;
        public int WriteCount => Volatile.Read(ref _writeCount);

        public void Release() => _gate.TrySetResult();

        public async Task WriteAsync(ShadowRun run, CancellationToken ct)
        {
            if (blockUntilReleased) await _gate.Task;
            Interlocked.Increment(ref _writeCount);
            Written.TrySetResult(run);
        }
    }

    private sealed class RecordingLlm(LlmResponse resp) : ILlmService
    {
        private int _calls;
        public int CallCount => Volatile.Read(ref _calls);

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            return Task.FromResult(resp);
        }

        public async IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            await Task.CompletedTask;
            yield return new LlmDelta(TextDelta: resp.Text);
        }
    }

    private sealed class CtCapturingLlm(LlmResponse resp) : ILlmService
    {
        public CancellationToken SeenToken { get; private set; }
        public bool SawCancelledToken { get; private set; }

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            SeenToken = ct;
            SawCancelledToken = ct.IsCancellationRequested;
            return Task.FromResult(resp);
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class ThrowingLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            throw new InvalidOperationException("shadow boom");

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new InvalidOperationException("shadow boom");
    }

    private sealed class DelayingLlm(TimeSpan delay, LlmResponse resp) : ILlmService
    {
        public async Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            await Task.Delay(delay, ct);
            return resp;
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class StreamingStub(IReadOnlyList<LlmDelta> deltas) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();

        public async IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            foreach (var d in deltas)
            {
                await Task.Yield();
                yield return d;
            }
        }
    }

    private sealed class ThrowingStreamStub : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();

        public async IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            yield return new LlmDelta(TextDelta: "partial");
            await Task.Yield();
            throw new InvalidOperationException("stream boom");
        }
    }

    /// <summary>Wraps an IServiceProvider to record requested keyed-service keys (so a test
    /// can assert the gateway resolved the "-raw" shadow provider). Also exposes a scope
    /// factory whose scopes record through the same bag.</summary>
    private sealed class KeyRecordingProvider(IServiceProvider inner, ConcurrentBag<string> keys)
        : IServiceProvider, IKeyedServiceProvider
    {
        public IServiceScopeFactory ScopeFactory => new RecordingScopeFactory(inner, keys);

        public object? GetService(Type serviceType) => inner.GetService(serviceType);

        public object? GetKeyedService(Type serviceType, object? serviceKey)
        {
            if (serviceKey is string s) keys.Add(s);
            return ((IKeyedServiceProvider)inner).GetKeyedService(serviceType, serviceKey);
        }

        public object GetRequiredKeyedService(Type serviceType, object? serviceKey)
        {
            if (serviceKey is string s) keys.Add(s);
            return ((IKeyedServiceProvider)inner).GetRequiredKeyedService(serviceType, serviceKey);
        }

        private sealed class RecordingScopeFactory(IServiceProvider root, ConcurrentBag<string> keys) : IServiceScopeFactory
        {
            public IServiceScope CreateScope()
            {
                var scope = root.GetRequiredService<IServiceScopeFactory>().CreateScope();
                return new RecordingScope(scope, keys);
            }
        }

        private sealed class RecordingScope(IServiceScope inner, ConcurrentBag<string> keys) : IServiceScope
        {
            public IServiceProvider ServiceProvider { get; } = new KeyRecordingProvider(inner.ServiceProvider, keys);
            public void Dispose() => inner.Dispose();
        }
    }
}
