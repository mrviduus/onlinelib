using System.Text.Json;
using Application.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;

namespace TextStack.AiEvals;

/// <summary>
/// AI-006 first golden: runs the real Explain prompt over a hand-curated dataset and
/// scores each output with an LLM-as-judge, asserting the mean clears a bootstrap bar.
///
/// Opt-in: skips unless OPENAI_API_KEY is set, so default CI (no key) stays green.
/// Run it with: OPENAI_API_KEY=… dotnet test tests/TextStack.AiEvals --filter Category=Eval
/// Regression-vs-baseline + a CI gate land later (AI-010).
/// </summary>
[Trait("Category", "Eval")]
public class ExplainEvalTests(ITestOutputHelper output)
{
    private const double BootstrapBar = 3.5;

    [Fact]
    public async Task Explain_golden_set_meets_quality_bar()
    {
        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        Assert.SkipWhen(string.IsNullOrWhiteSpace(apiKey), "OPENAI_API_KEY not set — Explain eval skipped (opt-in).");

        var goldens = LoadGoldens();
        Assert.True(goldens.Count >= 30, $"expected >=30 golden cases, got {goldens.Count}");

        // Empty config: OpenAiLlmClient falls back to OPENAI_API_KEY / OPENAI_MODEL env vars.
        var config = new ConfigurationBuilder().Build();
        var llm = new OpenAiLlmClient(config, NullLogger<OpenAiLlmClient>.Instance);
        var ct = TestContext.Current.CancellationToken;

        // Run the feature, then judge each output. Same OpenAI client serves both;
        // the judge call carries FeatureTag "eval.judge" for future routing/tracing.
        var results = await new GoldenRunner(llm).RunAsync(goldens, ToRequest, ct);

        var scores = new List<JudgeScore>();
        foreach (var r in results)
        {
            var judgePrompt = JudgeRunner.BuildExplainJudgePrompt(
                r.Case.Word, r.Case.Sentence, r.Case.ExpectedExplanation, r.Actual);
            var score = await new JudgeRunner(llm).JudgeAsync(judgePrompt, ct);
            scores.Add(score);
            output.WriteLine(
                $"[{score.Mean:0.0}] {r.Case.Word}: acc={score.Accuracy} con={score.Conciseness} " +
                $"use={score.Usefulness} — {Trunc(r.Actual)}");
        }

        var summary = JudgeRunner.Aggregate(scores);
        output.WriteLine(
            $"\nN={summary.N} accuracy={summary.MeanAccuracy:0.00} conciseness={summary.MeanConciseness:0.00} " +
            $"usefulness={summary.MeanUsefulness:0.00} OVERALL={summary.MeanOverall:0.00}");

        Assert.True(
            summary.MeanOverall >= BootstrapBar,
            $"Explain mean quality {summary.MeanOverall:0.00} below bootstrap bar {BootstrapBar:0.0}");
    }

    private static LlmRequest ToRequest(ExplainGolden g) => new(
        SystemPrompt: ExplainPrompt.BuildSystemPrompt(g.Genre, g.TargetLang),
        Messages: [new LlmMessage("user", ExplainPrompt.BuildUserPrompt(g.Word, g.Sentence))],
        MaxOutputTokens: 500,
        FeatureTag: "explain");

    private static IReadOnlyList<ExplainGolden> LoadGoldens()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Datasets", "explain.json");
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<ExplainGolden>>(
            json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("explain.json deserialized to null");
    }

    private static string Trunc(string s) => s.Length <= 80 ? s : s[..80] + "…";
}
