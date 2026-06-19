using System.Net.ServerSentEvents;
using Api.Endpoints;
using Application.Rag;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// AI-028 — the Ask SSE event stream (<see cref="AskSse.StreamEventsAsync"/>), driven through a fake
/// <see cref="AskStreamItem"/> source: text deltas then a terminal done-with-citations; the empty-chunks
/// case (friendly delta + insufficient done); a service-level error item; and a mid-stream throw → error.
/// </summary>
public class AskSseTests
{
    private static RetrievedChunk Chunk() =>
        new(Guid.NewGuid(), Guid.NewGuid(), 2, 0, "excerpt text", 0, 12, 0.9);

    private static async IAsyncEnumerable<AskStreamItem> Items(params AskStreamItem[] items)
    {
        foreach (var i in items)
        {
            await Task.Yield();
            yield return i;
        }
    }

    private static async IAsyncEnumerable<AskStreamItem> Boom()
    {
        await Task.Yield();
        yield return new AskStreamItem(TextDelta: "par");
        throw new InvalidOperationException("provider died");
    }

    private static async Task<List<SseItem<string>>> Collect(
        Func<CancellationToken, IAsyncEnumerable<AskStreamItem>> source)
    {
        var list = new List<SseItem<string>>();
        await foreach (var item in AskSse.StreamEventsAsync(source, onException: null, ct: TestContext.Current.CancellationToken))
            list.Add(item);
        return list;
    }

    [Fact]
    public async Task Stream_DeltasThenTerminalDoneWithCitations()
    {
        var chunk = Chunk();
        var events = await Collect(_ => Items(
            new AskStreamItem(TextDelta: "Hel"),
            new AskStreamItem(TextDelta: "lo [1]"),
            new AskStreamItem(Terminal: new AskTerminal([new AskCitationSource(1, chunk)], LastReadOrd: 4, Insufficient: false))));

        Assert.Equal(["delta", "delta", "done"], events.Select(e => e.EventType));
        Assert.Equal("Hel", events[0].Data);
        Assert.Equal("lo [1]", events[1].Data);

        var done = events[^1].Data;
        Assert.Contains("\"insufficient\":false", done);
        Assert.Contains("\"lastReadOrd\":4", done);
        Assert.Contains("\"marker\":1", done.Replace(" ", ""));
        Assert.Contains(chunk.ChunkId.ToString(), done);
    }

    [Fact]
    public async Task Stream_EmptyChunks_FriendlyDeltaThenInsufficientDone()
    {
        // Mirrors RagAskService.StreamAsync's no-chunks path: one delta + insufficient terminal, no citations.
        var events = await Collect(_ => Items(
            new AskStreamItem(TextDelta: "I don't see enough of this book yet."),
            new AskStreamItem(Terminal: new AskTerminal([], LastReadOrd: 0, Insufficient: true))));

        Assert.Equal(["delta", "done"], events.Select(e => e.EventType));
        Assert.Contains("\"insufficient\":true", events[^1].Data);
        Assert.Contains("\"citations\":[]", events[^1].Data.Replace(" ", ""));
    }

    [Fact]
    public async Task Stream_ServiceErrorItem_EmitsTerminalError()
    {
        var events = await Collect(_ => Items(
            new AskStreamItem(TextDelta: "partial"),
            new AskStreamItem(Error: "Ask is temporarily unavailable.")));

        Assert.Equal(["delta", "error"], events.Select(e => e.EventType));
        Assert.Equal("Ask is temporarily unavailable.", events[^1].Data);
    }

    [Fact]
    public async Task Stream_MidStreamThrow_EmitsErrorAsTerminal()
    {
        var events = await Collect(_ => Boom());

        Assert.Equal(["delta", "error"], events.Select(e => e.EventType));
    }

    [Fact]
    public async Task Stream_SourceFactoryThrows_EmitsError()
    {
        var events = await Collect(_ => throw new InvalidOperationException("no key"));

        var item = Assert.Single(events);
        Assert.Equal("error", item.EventType);
    }
}
