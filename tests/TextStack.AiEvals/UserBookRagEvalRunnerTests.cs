using Application.Rag;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Rag;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="UserBookRagEvalRunner"/> (user-book RAG eval, P1) with fake
/// retrieval + generator + judge + Ask (no DB, no embeddings, no key). Proves the synthesised-probe
/// path: seed retrieval → one generated question per chunk → real Ask path per question → shared
/// CitationJudge → greeting (structural) + off-book (judged) behaviour. Counting fakes assert the
/// empty-chunks short-circuit makes NO generator/judge LLM call (the catalog no-LLM-on-empty invariant).
/// </summary>
public class UserBookRagEvalRunnerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid BookId = Guid.NewGuid();

    private static UserBookRagEvalRunner Runner() =>
        new(NullLogger<UserBookRagEvalRunner>.Instance);

    private static RetrievedChunk Chunk(string text) =>
        new(Guid.NewGuid(), Guid.NewGuid(), 0, 0, text, 0, text.Length, 1.0);

    /// <summary>Returns <paramref name="count"/> chunks for any user-book query; empty on demand.</summary>
    private sealed class FakeUserBookRag(int count) : IRagService
    {
        public Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
            Guid editionId, string query, int k, int? maxChapterOrd, SummarySpec summaries, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
            Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, SummarySpec summaries, CancellationToken ct)
        {
            Assert.Equal(UserId, userId);
            Assert.Equal(BookId, userBookId);
            Assert.Null(maxChapterOrd); // user books are never gated
            // `count` is the book's available chunk pool; a retrieval returns up to k of them.
            var chunks = Enumerable.Range(0, Math.Min(count, k)).Select(i => Chunk($"passage {i} for '{query}'")).ToList();
            return Task.FromResult<IReadOnlyList<RetrievedChunk>>(chunks);
        }
    }

    /// <summary>Echoes a one-citation answer over the first chunk; empty chunks → insufficient (no cite).</summary>
    private sealed class FakeAsk : IRagAskService
    {
        public Task<AskAnswer> AskAsync(Guid u, Guid s, Guid e, string q, int k, Guid? currentChapterId, IReadOnlyList<Contracts.Books.AskTurnDto> history, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<AskAnswer> AskFromChunksAsync(
            string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> notes, IReadOnlyList<Contracts.Books.AskTurnDto> history, int lastReadOrd, CancellationToken ct)
        {
            var citations = chunks.Count == 0
                ? Array.Empty<AskCitationSource>()
                : [new AskCitationSource(1, chunks[0])];
            return Task.FromResult(new AskAnswer($"Grounded answer [1]. ({question})", citations, lastReadOrd, Insufficient: chunks.Count == 0));
        }
    }

    /// <summary>A warm-greeting Ask: always non-empty, no citation, no [n] marker, never insufficient.</summary>
    private sealed class WarmGreetingAsk : IRagAskService
    {
        public Task<AskAnswer> AskAsync(Guid u, Guid s, Guid e, string q, int k, Guid? currentChapterId, IReadOnlyList<Contracts.Books.AskTurnDto> history, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<AskAnswer> AskFromChunksAsync(
            string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> notes, IReadOnlyList<Contracts.Books.AskTurnDto> history, int lastReadOrd, CancellationToken ct) =>
            Task.FromResult(new AskAnswer("Hello! Happy to chat about this book.", [], lastReadOrd, Insufficient: false));
    }

    /// <summary>An Ask that cites even on a greeting — fails the structural greeting check.</summary>
    private sealed class CitingGreetingAsk : IRagAskService
    {
        public Task<AskAnswer> AskAsync(Guid u, Guid s, Guid e, string q, int k, Guid? currentChapterId, IReadOnlyList<Contracts.Books.AskTurnDto> history, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<AskAnswer> AskFromChunksAsync(
            string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> notes, IReadOnlyList<Contracts.Books.AskTurnDto> history, int lastReadOrd, CancellationToken ct)
        {
            var cite = chunks.Count == 0 ? Array.Empty<AskCitationSource>() : [new AskCitationSource(1, chunks[0])];
            return Task.FromResult(new AskAnswer("Hi [1].", cite, lastReadOrd, Insufficient: false));
        }
    }

    /// <summary>Generator that returns a fixed question; counts calls (to assert no-call-on-empty).</summary>
    private sealed class CountingGenerator : ILlmService
    {
        public int Calls;
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(new LlmResponse(
                "What is the main idea of this passage?", [], new LlmUsage(0, 0, 0m), "gen-fake", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>
    /// Judge returning a fixed rubric verdict (support/relevance/faithfulness) for citation grading, and
    /// a fixed YES/NO for the off-book faithfulness grade. Counts calls (to assert no-call-on-empty).
    /// </summary>
    private sealed class CountingJudge(int d1, int d2, int d3, string offBookVerdict) : ILlmService
    {
        public int Calls;
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Calls++;
            // The off-book faithfulness grader uses MaxOutputTokens=4 and asks for YES/NO; everything
            // else is the rubric JSON judge.
            var text = request.MaxOutputTokens <= 4
                ? offBookVerdict
                : $"{{\"d1\": {d1}, \"d2\": {d2}, \"d3\": {d3}, \"rationale\": \"ok\"}}";
            return Task.FromResult(new LlmResponse(text, [], new LlmUsage(0, 0, 0m), "judge-fake", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>A fake that throws if any LLM call is made — proves the empty-chunks short-circuit.</summary>
    private sealed class ThrowingLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            throw new InvalidOperationException("LLM must not be called on empty chunks");

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    [Fact]
    public async Task RunAsync_IndexedBook_GeneratesNProbesAndAggregatesCitations()
    {
        var gen = new CountingGenerator();
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 6), new FakeAsk(), gen, new CountingJudge(5, 4, 5, "no"),
            judgeModelId: "judge-fake", UserId, BookId, probeCount: 6, k: 8,
            persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        // Seed retrieval returns 6 chunks → 6 generated questions → 6 generator calls.
        Assert.Equal(6, gen.Calls);
        Assert.Equal(6, result.ProbeN);
        Assert.Equal(6, result.ProbeCases.Count);
        Assert.NotNull(result.Citation);
        Assert.Equal(6, result.Citation!.CitationsJudged); // one citation per probe answer
        Assert.Equal((5 + 4 + 5) / 3.0, result.Citation.Score, 3);
        Assert.Equal(1.0, result.Citation.SupportRate, 12); // D1=5 ≥4 for every citation
        Assert.Equal(1.0, result.Retrieval, 12);            // every probe retrieved ≥1 chunk
        Assert.Null(result.Note);
    }

    [Fact]
    public async Task RunAsync_LowSupportAxis_ZeroSupportRate()
    {
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new FakeAsk(), new CountingGenerator(),
            new CountingJudge(2, 5, 5, "no"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        Assert.NotNull(result.Citation);
        Assert.Equal(0.0, result.Citation!.SupportRate, 12); // D1=2 < 4 → no citation supported
    }

    [Fact]
    public async Task RunAsync_WarmGreeting_StructuralPass()
    {
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new WarmGreetingAsk(), new CountingGenerator(),
            new CountingJudge(5, 5, 5, "no"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        var greeting = result.BehaviorCases.Single(c => c.Kind == "greeting");
        Assert.True(greeting.Pass); // non-empty, 0 citations, not insufficient, no [n] marker
    }

    [Fact]
    public async Task RunAsync_GreetingThatCites_StructuralFail()
    {
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new CitingGreetingAsk(), new CountingGenerator(),
            new CountingJudge(5, 5, 5, "no"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        var greeting = result.BehaviorCases.Single(c => c.Kind == "greeting");
        Assert.False(greeting.Pass); // cited + has [1] marker → fails the warm-greeting check
    }

    [Fact]
    public async Task RunAsync_OffBookGrounded_JudgePass()
    {
        // Judge says "no" (no invented facts) → off-book probe passes. WarmGreetingAsk keeps the off-book
        // answer non-insufficient so it actually reaches the judge.
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new WarmGreetingAsk(), new CountingGenerator(),
            new CountingJudge(5, 5, 5, offBookVerdict: "no"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        var offBook = result.BehaviorCases.Single(c => c.Kind == "off_book");
        Assert.True(offBook.Pass);
    }

    [Fact]
    public async Task RunAsync_OffBookHallucinates_JudgeFail()
    {
        // Judge says "yes" (invented facts) → off-book probe fails. WarmGreetingAsk makes the greeting
        // pass and keeps the off-book answer non-insufficient so the "yes" verdict is what fails it.
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new WarmGreetingAsk(), new CountingGenerator(),
            new CountingJudge(5, 5, 5, offBookVerdict: "yes"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        var offBook = result.BehaviorCases.Single(c => c.Kind == "off_book");
        Assert.False(offBook.Pass);
        Assert.Equal(0.5, result.BehaviorPass, 12); // greeting passes, off-book fails → 1 of 2
    }

    [Fact]
    public async Task RunAsync_Persist_WritesCitationBehaviorRetrievalRows()
    {
        var db = new CapturingDb();
        await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new FakeAsk(), new CountingGenerator(),
            new CountingJudge(5, 5, 5, "no"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: true, db, gitSha: "abc123", TestContext.Current.CancellationToken);

        Assert.Equal(3, db.Added.Count);
        Assert.Contains(db.Added, r => r.Feature == UserBookRagEvalRunner.CitationFeature);
        Assert.Contains(db.Added, r => r.Feature == UserBookRagEvalRunner.BehaviorFeature);
        Assert.Contains(db.Added, r => r.Feature == UserBookRagEvalRunner.RetrievalFeature);
        Assert.All(db.Added, r => Assert.Equal("abc123", r.GitSha));
        Assert.Equal(1, db.SaveCalls);
    }

    [Fact]
    public async Task RunAsync_PersistOff_WritesNothing()
    {
        var db = new CapturingDb();
        await Runner().RunAsync(
            new FakeUserBookRag(count: 1), new FakeAsk(), new CountingGenerator(),
            new CountingJudge(5, 5, 5, "no"), judgeModelId: "judge-fake", UserId, BookId,
            probeCount: 6, k: 8, persist: false, db, gitSha: null, TestContext.Current.CancellationToken);

        Assert.Empty(db.Added);
        Assert.Equal(0, db.SaveCalls);
    }

    [Fact]
    public async Task RunAsync_EmptyChunks_PersistsTwoFailedRows()
    {
        var db = new CapturingDb();
        await Runner().RunAsync(
            new FakeUserBookRag(count: 0), new FakeAsk(), new ThrowingLlm(), new ThrowingLlm(),
            judgeModelId: "judge-fake", UserId, BookId, probeCount: 6, k: 8,
            persist: true, db, gitSha: null, TestContext.Current.CancellationToken);

        // citation + behavior rows, both 0-score with an empty-chunks note; NO retrieval row.
        Assert.Equal(2, db.Added.Count);
        Assert.All(db.Added, r => Assert.Equal(0m, r.Score));
        Assert.All(db.Added, r => Assert.Contains("empty-chunks", r.BreakdownJson));
        Assert.Equal(1, db.SaveCalls);
    }

    [Fact]
    public async Task RunAsync_EmptyChunks_ShortCircuitsWithNoLlmCall()
    {
        var result = await Runner().RunAsync(
            new FakeUserBookRag(count: 0), new FakeAsk(), new ThrowingLlm(), new ThrowingLlm(),
            judgeModelId: "judge-fake", UserId, BookId, probeCount: 6, k: 8,
            persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        // Empty seed → no generator/judge call (ThrowingLlm would have thrown), failed 0-row + note.
        Assert.Null(result.Citation);
        Assert.Equal(0, result.ProbeN);
        Assert.Equal(0.0, result.Retrieval, 12);
        Assert.Equal(0.0, result.BehaviorPass, 12);
        Assert.Empty(result.ProbeCases);
        Assert.Empty(result.BehaviorCases);
        Assert.NotNull(result.Note);
    }
}
