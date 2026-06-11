using Microsoft.Extensions.Logging.Abstractions;
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
    }

    [Fact]
    public async Task RunAsync_PerfectRetriever_FullRecallNoLeak()
    {
        var runner = new RagEvalRunner(NullLogger<RagEvalRunner>.Instance);
        var result = await runner.RunAsync(
            new PerfectRag(), Guid.NewGuid(), k: 8, persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        Assert.Equal(1.0, result.Recall, 12);
        Assert.Equal(0.0, result.SpoilerLeakRate, 12);
        Assert.Equal(RetrievalN, result.RecallN);
        Assert.Equal(SpoilerN, result.SpoilerN);
        Assert.All(result.RecallCases, c => Assert.True(c.Hit));
        Assert.All(result.SpoilerCases, c => Assert.Equal(0, c.LeakCount));
    }

    [Fact]
    public async Task RunAsync_LeakyRetriever_ZeroRecallFullLeak()
    {
        var runner = new RagEvalRunner(NullLogger<RagEvalRunner>.Instance);
        var result = await runner.RunAsync(
            new LeakyRag(), Guid.NewGuid(), k: 8, persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        Assert.Equal(0.0, result.Recall, 12);
        Assert.Equal(1.0, result.SpoilerLeakRate, 12);
        Assert.All(result.SpoilerCases, c => Assert.True(c.LeakCount > 0));
    }
}
