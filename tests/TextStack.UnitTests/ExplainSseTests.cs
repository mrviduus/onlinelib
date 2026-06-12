using System.Net.ServerSentEvents;
using Api.Endpoints;
using TextStack.Ai.Core;

namespace TextStack.UnitTests;

/// <summary>
/// AI-031a — the Explain SSE event stream (<see cref="ExplainEndpoints.StreamEventsAsync"/>), driven
/// through fake delegates: cache hit, token streaming + persist, empty-stream fallback, and error
/// terminal events.
/// </summary>
public class ExplainSseTests
{
    private static async IAsyncEnumerable<LlmDelta> Deltas(params LlmDelta[] deltas)
    {
        foreach (var d in deltas)
        {
            await Task.Yield();
            yield return d;
        }
    }

    private static async IAsyncEnumerable<LlmDelta> Boom()
    {
        await Task.Yield();
        yield return new LlmDelta(TextDelta: "par");
        throw new InvalidOperationException("provider died");
    }

    private async Task<List<SseItem<string>>> CollectEvents(
        Func<CancellationToken, IAsyncEnumerable<LlmDelta>> primary,
        Func<CancellationToken, Task<string>>? fallback = null,
        string? cached = null,
        Action<string>? onPersist = null)
    {
        var items = new List<SseItem<string>>();
        await foreach (var item in ExplainEndpoints.StreamEventsAsync(
            "quorum",
            primary,
            fallback ?? (_ => Task.FromResult(string.Empty)),
            _ => Task.FromResult(cached),
            (text, _) => { onPersist?.Invoke(text); return Task.CompletedTask; },
            onException: null,
            ct: TestContext.Current.CancellationToken))
        {
            items.Add(item);
        }
        return items;
    }

    [Fact]
    public async Task CacheHit_EmitsSingleDeltaAndCachedDone()
    {
        var events = await CollectEvents(_ => Deltas(), cached: "A cached explanation.");

        Assert.Equal(["delta", "done"], events.Select(e => e.EventType));
        Assert.Equal("A cached explanation.", events[0].Data);
        Assert.Contains("\"cached\":true", events[1].Data);
    }

    [Fact]
    public async Task Stream_EmitsDeltaPerFragment_PersistsFullText_ThenDone()
    {
        string? persisted = null;
        var events = await CollectEvents(
            _ => Deltas(
                new LlmDelta(TextDelta: "Hel"),
                new LlmDelta(TextDelta: "lo"),
                new LlmDelta(FinalUsage: new LlmUsage(5, 2, 0.001m), ModelId: "m")), // usage delta → no SSE event
            onPersist: t => persisted = t);

        Assert.Equal(["delta", "delta", "done"], events.Select(e => e.EventType));
        Assert.Equal("Hello", persisted);
        Assert.Contains("\"cached\":false", events[^1].Data);
    }

    [Fact]
    public async Task EmptyStream_FallsBackToRetry_EmitsRetriedTextAsDelta()
    {
        string? persisted = null;
        var events = await CollectEvents(
            _ => Deltas(new LlmDelta(FinalUsage: new LlmUsage(0, 0, 0m), ModelId: "m")), // no text at all
            fallback: _ => Task.FromResult("Retried explanation."),
            onPersist: t => persisted = t);

        Assert.Equal(["delta", "done"], events.Select(e => e.EventType));
        Assert.Equal("Retried explanation.", events[0].Data);
        Assert.Equal("Retried explanation.", persisted);
    }

    [Fact]
    public async Task EmptyStream_FallbackAlsoEmpty_EmitsErrorNotDone()
    {
        var events = await CollectEvents(
            _ => Deltas(),
            fallback: _ => Task.FromResult(string.Empty));

        var item = Assert.Single(events);
        Assert.Equal("error", item.EventType);
    }

    [Fact]
    public async Task MidStreamFailure_EmitsErrorAsTerminalEvent_NothingPersisted()
    {
        var persisted = false;
        var events = await CollectEvents(_ => Boom(), onPersist: _ => persisted = true);

        Assert.Equal(["delta", "error"], events.Select(e => e.EventType)); // partial text then error
        Assert.False(persisted);
    }

    [Fact]
    public async Task FallbackThrows_EmitsError()
    {
        var events = await CollectEvents(
            _ => Deltas(),
            fallback: _ => throw new InvalidOperationException("retry died"));

        var item = Assert.Single(events);
        Assert.Equal("error", item.EventType);
    }
}
