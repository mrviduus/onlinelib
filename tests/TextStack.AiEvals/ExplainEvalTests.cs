using Application.Ai;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;

namespace TextStack.AiEvals;

/// <summary>
/// Explain golden eval (AI-006, now on the generic AI-007 judge API): runs the real
/// Explain prompt over a curated dataset and scores each output with an LLM-as-judge.
/// Opt-in — skips without OPENAI_API_KEY. See AI-006 notes; regression gate is AI-010.
/// </summary>
[Trait("Category", "Eval")]
public class ExplainEvalTests(ITestOutputHelper output)
{
    private const double BootstrapBar = 3.5;

    private static readonly Rubric Rubric = new(
        "accuracy: does it match the meaning the word carries IN THIS SENTENCE's domain?",
        "conciseness: 2-3 sentences, no padding, no dictionary boilerplate?",
        "usefulness: would a developer learning the topic find it genuinely helpful?");

    [Fact]
    public async Task Explain_golden_set_meets_quality_bar()
    {
        var llm = EvalClients.OpenAi();
        var ct = TestContext.Current.CancellationToken;

        var goldens = GoldenData.Load<ExplainGolden>("explain.json");
        Assert.True(goldens.Count >= 30, $"expected >=30 golden cases, got {goldens.Count}");

        var results = await new GoldenRunner(llm).RunAsync(goldens, ToRequest, ct);

        var scores = new List<JudgeScore>();
        foreach (var r in results)
        {
            var evidence =
                $"Word: {r.Case.Word}\nSentence: {r.Case.Sentence}\n" +
                $"Reference explanation: {r.Case.ExpectedExplanation}\nActual explanation: {r.Actual}";
            var score = await new JudgeRunner(llm).JudgeAsync(Rubric, evidence, ct);
            scores.Add(score);
            output.WriteLine($"[{score.Mean:0.0}] {r.Case.Word}: {score.D1}/{score.D2}/{score.D3} — {Trunc(r.Actual)}");
        }

        var s = JudgeRunner.Aggregate(scores);
        output.WriteLine($"\nN={s.N} acc={s.Mean1:0.00} con={s.Mean2:0.00} use={s.Mean3:0.00} OVERALL={s.MeanOverall:0.00}");
        Assert.True(s.MeanOverall >= BootstrapBar, $"Explain mean {s.MeanOverall:0.00} below bootstrap bar {BootstrapBar:0.0}");
    }

    private static LlmRequest ToRequest(ExplainGolden g) => new(
        SystemPrompt: ExplainPrompt.BuildSystemPrompt(g.Genre, g.TargetLang),
        Messages: [new LlmMessage("user", ExplainPrompt.BuildUserPrompt(g.Word, g.Sentence))],
        MaxOutputTokens: 500,
        FeatureTag: "explain");

    private static string Trunc(string str) => str.Length <= 70 ? str : str[..70] + "…";
}
