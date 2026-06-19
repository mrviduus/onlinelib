using System.Runtime.CompilerServices;
using Application.Rag;
using Contracts.Books;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// AI-028 — service-level guards on <see cref="RagAskService"/> driven by a deterministic, CALL-COUNTING
/// fake <see cref="ILlmService"/> (no key, no network). The #1 invariant: when retrieval returns 0 chunks
/// (un-read / beyond progress / unindexed), BOTH the JSON (<c>AskFromChunksAsync</c>) and streaming
/// (<c>StreamAsync</c>) paths short-circuit to the friendly insufficient message WITHOUT calling the LLM —
/// a single model call on empty chunks would be a spoiler/hallucination leak. Also: the non-empty path
/// calls the model exactly once, threads the clamped multi-turn history into the request, and resolves
/// citations from the ACCUMULATED streamed text (not per-delta).
/// </summary>
public class RagAskServiceTests
{
    private static RetrievedChunk Chunk(int ord, string text) =>
        new(Guid.NewGuid(), Guid.NewGuid(), ord, 0, text, 0, text.Length, 0.9);

    /// <summary>Counts CompleteAsync/StreamAsync calls and captures the last request; emits scripted output.</summary>
    private sealed class CountingLlm(string completeText, string[] streamFragments) : ILlmService
    {
        public int CompleteCalls { get; private set; }
        public int StreamCalls { get; private set; }
        public LlmRequest? LastRequest { get; private set; }

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            CompleteCalls++;
            LastRequest = request;
            return Task.FromResult(new LlmResponse(
                completeText, [], new LlmUsage(0, 0, 0m), "fake-model", Guid.NewGuid()));
        }

        public async IAsyncEnumerable<LlmDelta> StreamAsync(
            LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            StreamCalls++;
            LastRequest = request;
            foreach (var f in streamFragments)
            {
                await Task.Yield();
                yield return new LlmDelta(TextDelta: f);
            }
        }
    }

    /// <summary>An ILlmService that throws if EITHER method is ever invoked — proves no model call happened.</summary>
    private sealed class ThrowingLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            throw new InvalidOperationException("LLM must NOT be called on empty chunks");

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new InvalidOperationException("LLM must NOT be called on empty chunks");
    }

    // RagContextService is only used by AskAsync (the progress-gated entry). These guard tests target
    // AskFromChunksAsync / StreamAsync directly, so context is never touched — pass null safely.
    private static RagAskService Service(ILlmService llm) => new(context: null!, llm);

    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    // ---- Empty-chunk short-circuit (spoiler / hallucination gate) ------------------------------------

    [Fact]
    public async Task AskFromChunksAsync_EmptyChunks_DoesNotCallLlm_ReturnsInsufficient()
    {
        var svc = Service(new ThrowingLlm()); // throws if the model is touched

        var answer = await svc.AskFromChunksAsync(
            "what happens at the end?", chunks: [], noteTexts: [], history: [], lastReadOrd: 3, Ct);

        Assert.True(answer.Insufficient);
        Assert.Empty(answer.Citations);
        Assert.Equal(3, answer.LastReadOrd);
        Assert.Contains("don't see enough", answer.Answer);
    }

    [Fact]
    public async Task StreamAsync_EmptyChunks_DoesNotCallLlm_FriendlyDeltaThenInsufficientTerminal()
    {
        var svc = Service(new ThrowingLlm()); // throws if the model is touched

        var items = new List<AskStreamItem>();
        await foreach (var i in svc.StreamAsync(
            "what happens at the end?", chunks: [], noteTexts: [], history: [], lastReadOrd: 0, Ct))
            items.Add(i);

        Assert.Equal(2, items.Count);
        Assert.False(string.IsNullOrEmpty(items[0].TextDelta));
        Assert.NotNull(items[1].Terminal);
        Assert.True(items[1].Terminal!.Insufficient);
        Assert.Empty(items[1].Terminal!.Citations);
    }

    // ---- Non-empty path: exactly one model call, history threaded, citations resolved ---------------

    [Fact]
    public async Task AskFromChunksAsync_WithChunks_CallsLlmOnce_ResolvesCitations()
    {
        var llm = new CountingLlm("The hero leaves home [1] and meets a guide [2].", []);
        var svc = Service(llm);

        var answer = await svc.AskFromChunksAsync(
            "what happens?", [Chunk(1, "left home"), Chunk(2, "the guide")], noteTexts: [],
            history: [], lastReadOrd: 5, Ct);

        Assert.Equal(1, llm.CompleteCalls);
        Assert.False(answer.Insufficient);
        Assert.Equal(new[] { 1, 2 }, answer.Citations.Select(c => c.Marker));
    }

    [Fact]
    public async Task AskFromChunksAsync_ThreadsClampedHistoryIntoRequest()
    {
        var llm = new CountingLlm("ok", []);
        var svc = Service(llm);

        var history = new AskTurnDto[]
        {
            new("user", "who is she?"),
            new("assistant", "She is introduced early [1]."),
        };

        await svc.AskFromChunksAsync("and then?", [Chunk(1, "excerpt")], [], history, lastReadOrd: 0, Ct);

        // Assembly order: context block (user) → prior turns → new question last. System prompt separate.
        var msgs = llm.LastRequest!.Messages;
        Assert.Equal("user", msgs[0].Role);                       // context block
        Assert.Equal("who is she?", msgs[1].Content);             // prior user turn
        Assert.Equal("She is introduced early [1].", msgs[2].Content); // prior assistant turn
        Assert.Equal("and then?", msgs[^1].Content);              // new question last
        Assert.Equal(RagAskService.FeatureTag, llm.LastRequest!.FeatureTag);
        Assert.False(string.IsNullOrWhiteSpace(llm.LastRequest!.SystemPrompt));
    }

    [Fact]
    public async Task StreamAsync_WithChunks_CitationsFromAccumulatedText_NotPerDelta()
    {
        // The "[1]" marker is split across two deltas; citations must come from the FULL accumulated text.
        var llm = new CountingLlm("", ["The hero leaves home [", "1] for adventure."]);
        var svc = Service(llm);

        var items = new List<AskStreamItem>();
        await foreach (var i in svc.StreamAsync(
            "what happens?", [Chunk(1, "left home")], [], history: [], lastReadOrd: 7, Ct))
            items.Add(i);

        Assert.Equal(1, llm.StreamCalls);
        var terminal = items[^1].Terminal;
        Assert.NotNull(terminal);
        Assert.False(terminal!.Insufficient);
        Assert.Equal(7, terminal.LastReadOrd);
        // Single citation resolved from the reassembled "[1]" that no single delta contained.
        Assert.Equal(new[] { 1 }, terminal.Citations.Select(c => c.Marker));
    }

    [Fact]
    public async Task StreamAsync_ProviderResolutionThrows_EmitsErrorTerminal_NoThrow()
    {
        // A keyless host throws when the gateway resolves the provider inside StreamAsync — the service
        // must surface that as an Error item, not let the stream blow up.
        var svc = Service(new ThrowingLlm());

        var items = new List<AskStreamItem>();
        await foreach (var i in svc.StreamAsync(
            "q?", [Chunk(1, "x")], [], history: [], lastReadOrd: 0, Ct))
            items.Add(i);

        var last = Assert.Single(items);
        Assert.False(string.IsNullOrEmpty(last.Error));
        Assert.Null(last.Terminal);
    }
}
