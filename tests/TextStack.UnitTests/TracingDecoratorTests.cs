using System.Runtime.CompilerServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

public class TracingDecoratorTests
{
    private static LlmRequest Req(string? feature = "explain") =>
        new("system prompt", new[] { new LlmMessage("user", "hello") }, 100, FeatureTag: feature);

    private static LlmResponse Resp() =>
        new("the answer", Array.Empty<ToolCall>(), new LlmUsage(10, 5, 0.0001m), "gpt-4.1-nano", Guid.NewGuid());

    // ---- ShouldSample ----

    [Fact]
    public void ShouldSample_Error_AlwaysTrue_EvenAtZeroRate()
    {
        var opts = new TracingOptions(DefaultSampleRate: 0.0);
        Assert.True(TracingDecorator.ShouldSample("explain", isError: true, opts));
    }

    [Theory]
    [InlineData(1.0, true)]
    [InlineData(0.0, false)]
    public void ShouldSample_NonError_HonorsDeterministicRate(double rate, bool expected)
    {
        var opts = new TracingOptions(DefaultSampleRate: rate);
        Assert.Equal(expected, TracingDecorator.ShouldSample("translate", isError: false, opts));
    }

    [Fact]
    public void ShouldSample_PerFeatureOverride_BeatsDefault()
    {
        var opts = new TracingOptions(
            DefaultSampleRate: 1.0,
            PerFeatureRates: new Dictionary<string, double> { ["explain"] = 0.0 });
        Assert.False(TracingDecorator.ShouldSample("explain", isError: false, opts)); // overridden to 0
        Assert.True(TracingDecorator.ShouldSample("rag", isError: false, opts));       // default 1.0
    }

    // ---- BuildTrace ----

    [Fact]
    public void BuildTrace_Success_PopulatesFromResponse()
    {
        var resp = Resp();
        var trace = TracingDecorator.BuildTrace(Req(), resp, latencyMs: 42, error: null);

        Assert.Equal(resp.TraceId, trace.Id);
        Assert.Equal("explain", trace.FeatureTag);
        Assert.Equal("gpt-4.1-nano", trace.ModelId);
        Assert.Equal(10, trace.TokensIn);
        Assert.Equal(5, trace.TokensOut);
        Assert.Equal(0.0001m, trace.CostUsd);
        Assert.Equal(42, trace.LatencyMs);
        Assert.Null(trace.Error);
        Assert.False(string.IsNullOrEmpty(trace.PromptHash));
        Assert.Contains("hello", trace.MessagesJson);
    }

    [Fact]
    public void BuildTrace_Error_NoResponse_DefaultsAndZeros()
    {
        var trace = TracingDecorator.BuildTrace(Req(), response: null, latencyMs: 5, error: "boom");

        Assert.Equal("unknown", trace.ModelId);
        Assert.Equal("boom", trace.Error);
        Assert.Equal(0, trace.TokensIn);
        Assert.Equal(0m, trace.CostUsd);
        Assert.NotEqual(Guid.Empty, trace.Id);
    }

    [Fact]
    public void BuildTrace_NullFeatureTag_DefaultsToUnknown()
    {
        var trace = TracingDecorator.BuildTrace(Req(feature: null), Resp(), 1, null);
        Assert.Equal("unknown", trace.FeatureTag);
    }

    // ---- TraceRedactor ----

    [Fact]
    public void Redact_MasksEmailAndPhone()
    {
        var red = TraceRedactor.Redact("reach me at john.doe@example.com or +1 (415) 555-2671 today");
        Assert.DoesNotContain("john.doe@example.com", red);
        Assert.DoesNotContain("555-2671", red);
        Assert.Contains("[redacted-email]", red);
        Assert.Contains("[redacted-phone]", red);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Redact_NullOrEmpty_PassesThrough(string? input)
    {
        Assert.Equal(input, TraceRedactor.Redact(input));
    }

    // ---- pass-through (response unchanged; trace write is fire-and-forget) ----

    [Fact]
    public async Task CompleteAsync_ReturnsInnerResponseUnchanged()
    {
        var services = new ServiceCollection();
        services.AddScoped<ILlmTraceWriter, NoOpWriter>();
        using var sp = services.BuildServiceProvider();

        var resp = Resp();
        var decorator = new TracingDecorator(
            new StubLlm(resp),
            sp.GetRequiredService<IServiceScopeFactory>(),
            new TracingOptions(),
            NullLogger<TracingDecorator>.Instance);

        var result = await decorator.CompleteAsync(Req(), CancellationToken.None);

        Assert.Equal(resp.Text, result.Text);
        Assert.Equal(resp.ModelId, result.ModelId);
        Assert.Equal(resp.Usage.InputTokens, result.Usage.InputTokens);
    }

    private sealed class StubLlm(LlmResponse resp) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) => Task.FromResult(resp);

        public async IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            await Task.CompletedTask;
            yield return new LlmDelta(TextDelta: resp.Text);
        }
    }

    private sealed class NoOpWriter : ILlmTraceWriter
    {
        public Task WriteAsync(LlmTrace trace, CancellationToken ct) => Task.CompletedTask;
    }
}
