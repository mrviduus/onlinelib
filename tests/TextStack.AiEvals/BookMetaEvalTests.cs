using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using Worker.Services;

namespace TextStack.AiEvals;

/// <summary>
/// BookMetadata golden eval: Ollama generates GENRE/YEAR/DESCRIPTION from the real
/// prompt, then an LLM-as-judge (OpenAI) scores genre/year/description quality.
/// Opt-in — skips unless Ollama is reachable AND OPENAI_API_KEY is set.
/// </summary>
[Trait("Category", "Eval")]
public class BookMetaEvalTests(ITestOutputHelper output)
{
    private const double BootstrapBar = 3.0;

    private static readonly Rubric Rubric = new(
        "genre-accuracy: does the GENRE line match or reasonably fit the book?",
        "year-plausibility: is the YEAR correct or close to the real first-publication year (ancient works may be approximate)?",
        "description-quality: is the DESCRIPTION accurate, 2-3 sentences, no spoilers?");

    [Fact]
    public async Task BookMetadata_golden_set_meets_quality_bar()
    {
        var gen = EvalClients.Ollama();
        var judgeClient = EvalClients.OpenAi();
        var ct = TestContext.Current.CancellationToken;

        var goldens = GoldenData.Load<BookMetaGolden>("bookmeta.json");
        Assert.True(goldens.Count >= 30, $"expected >=30 golden cases, got {goldens.Count}");

        var results = await new GoldenRunner(gen).RunAsync(goldens, ToRequest, ct);
        var judge = new JudgeRunner(judgeClient);

        var scores = new List<JudgeScore>();
        foreach (var r in results)
        {
            var g = r.Case;
            var evidence =
                $"Title: {g.Title}\nAuthor: {g.Author ?? "(unknown)"}\n" +
                $"Reference genre: {g.ExpectedGenre}\n" +
                $"Reference year: {g.ExpectedYear?.ToString() ?? "ancient/uncertain"}\n" +
                $"Reference description: {g.ExpectedDescription}\n" +
                $"Model output (GENRE/YEAR/DESCRIPTION lines):\n{r.Actual}";
            var score = await judge.JudgeAsync(Rubric, evidence, ct);
            scores.Add(score);
            output.WriteLine($"[{score.Mean:0.0}] {g.Title}: {score.D1}/{score.D2}/{score.D3}");
        }

        var s = JudgeRunner.Aggregate(scores);
        output.WriteLine($"\nN={s.N} genre={s.Mean1:0.00} year={s.Mean2:0.00} desc={s.Mean3:0.00} OVERALL={s.MeanOverall:0.00}");
        Assert.True(s.MeanOverall >= BootstrapBar, $"BookMetadata mean {s.MeanOverall:0.00} below bootstrap bar {BootstrapBar:0.0}");
    }

    private static LlmRequest ToRequest(BookMetaGolden g)
    {
        var (system, user) = BookMetadataPrompt.Build(g.Title, g.Author, needsDescription: true);
        return new LlmRequest(system, [new LlmMessage("user", user)], MaxOutputTokens: 400, FeatureTag: "bookmeta");
    }
}
