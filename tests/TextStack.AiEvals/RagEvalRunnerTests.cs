using Application.Rag;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Rag;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="RagEvalRunner"/> (AI-027a) with a fake <see cref="IRagService"/>
/// (no DB, no embeddings) — proves the path: load goldens → retrieve per case → score with
/// <see cref="RetrievalMetrics"/> → aggregate recall + spoiler-leak. Counts come from the embedded
/// datasets (not magic numbers) so the test survives the golden set growing to its DoD size.
/// </summary>
public class RagEvalRunnerTests
{
    private static readonly int RetrievalN = RagGoldenSet.LoadRetrieval().Count;
    private static readonly int SpoilerN = RagGoldenSet.LoadSpoiler().Count;

    /// <summary>Answers each golden ideally: recall queries get a chapter+phrase hit; gated queries stay clean.</summary>
    private sealed class PerfectRag : IRagService
    {
        private static RetrievedChunk Chunk(int ord, string text) =>
            new(Guid.NewGuid(), Guid.NewGuid(), ord, 0, text, 0, text.Length, 1.0);

        public Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
            Guid editionId, string query, int k, int? maxChapterOrd, CancellationToken ct)
        {
            if (maxChapterOrd is null)
            {
                // Recall: find the golden by its question and return an ideal hit (its chapter + a phrase).
                var g = RagGoldenSet.LoadRetrieval().First(x => x.Question == query);
                return Ok(Chunk(g.ExpectedChapterOrd, g.ExpectedPhrases[0]));
            }
            // Spoiler: return a chunk AT the gate — never past it.
            return Ok(Chunk(maxChapterOrd.Value, "gated content"));
        }

        private static Task<IReadOnlyList<RetrievedChunk>> Ok(RetrievedChunk c) =>
            Task.FromResult<IReadOnlyList<RetrievedChunk>>([c]);

        public Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
            Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>Whiffs recall (wrong chapter) and leaks every gate (returns a chunk past it).</summary>
    private sealed class LeakyRag : IRagService
    {
        public Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
            Guid editionId, string query, int k, int? maxChapterOrd, CancellationToken ct)
        {
            // Gated queries MUST pass a non-null ceiling — assert the runner forwards it.
            var ord = (maxChapterOrd ?? 0) + 99; // wrong chapter for recall; past the gate for spoiler
            var chunk = new RetrievedChunk(Guid.NewGuid(), Guid.NewGuid(), ord, 0, "irrelevant", 0, 10, 0.0);
            return Task.FromResult<IReadOnlyList<RetrievedChunk>>([chunk]);
        }

        public Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
            Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>Echoes back a one-citation answer pointing at the first supplied chunk.</summary>
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

    /// <summary>A judge that always returns the same rubric verdict (support/relevance/faithfulness).</summary>
    private sealed class FixedJudge(int d1, int d2, int d3) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            Task.FromResult(new LlmResponse(
                $"{{\"d1\": {d1}, \"d2\": {d2}, \"d3\": {d3}, \"rationale\": \"ok\"}}",
                [], new LlmUsage(0, 0, 0m), "judge-fake", Guid.NewGuid()));

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    [Fact]
    public async Task RunAsync_PerfectRetriever_FullRecallNoLeak()
    {
        var runner = new RagEvalRunner(NullLogger<RagEvalRunner>.Instance);
        var result = await runner.RunAsync(
            new PerfectRag(), ask: null, judge: null, judgeModelId: null, Guid.NewGuid(), k: 8,
            persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        Assert.Equal(1.0, result.Recall, 12);
        Assert.Equal(0.0, result.SpoilerLeakRate, 12);
        Assert.Equal(RetrievalN, result.RecallN);
        Assert.Equal(SpoilerN, result.SpoilerN);
        Assert.All(result.RecallCases, c => Assert.True(c.Hit));
        Assert.All(result.SpoilerCases, c => Assert.Equal(0, c.LeakCount));
        Assert.Null(result.Citation); // no judge supplied → retrieval-only
    }

    [Fact]
    public async Task RunAsync_LeakyRetriever_ZeroRecallFullLeak()
    {
        var runner = new RagEvalRunner(NullLogger<RagEvalRunner>.Instance);
        var result = await runner.RunAsync(
            new LeakyRag(), ask: null, judge: null, judgeModelId: null, Guid.NewGuid(), k: 8,
            persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        Assert.Equal(0.0, result.Recall, 12);
        Assert.Equal(1.0, result.SpoilerLeakRate, 12);
        Assert.All(result.SpoilerCases, c => Assert.True(c.LeakCount > 0));
    }

    [Fact]
    public async Task RunAsync_WithJudge_ScoresCitations()
    {
        var runner = new RagEvalRunner(NullLogger<RagEvalRunner>.Instance);
        var result = await runner.RunAsync(
            new PerfectRag(), new FakeAsk(), new FixedJudge(5, 4, 5), judgeModelId: "judge-fake",
            Guid.NewGuid(), k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        Assert.NotNull(result.Citation);
        Assert.Equal((5 + 4 + 5) / 3.0, result.Citation!.Score, 3); // rubric mean
        Assert.Equal(1.0, result.Citation.SupportRate, 12);          // D1=5 ≥4 for every citation
        Assert.Equal(RetrievalN, result.Citation.CitationsJudged);   // one citation per golden answer
        Assert.Equal(RetrievalN, result.Citation.AnswersGenerated);
    }

    [Fact]
    public async Task RunAsync_WithJudge_LowSupportAxis_ZeroSupportRate()
    {
        var runner = new RagEvalRunner(NullLogger<RagEvalRunner>.Instance);
        var result = await runner.RunAsync(
            new PerfectRag(), new FakeAsk(), new FixedJudge(2, 5, 5), judgeModelId: "judge-fake",
            Guid.NewGuid(), k: 8, persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        Assert.NotNull(result.Citation);
        Assert.Equal(0.0, result.Citation!.SupportRate, 12); // D1=2 < 4 → no citation counts as supported
    }
}
