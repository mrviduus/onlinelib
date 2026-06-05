using Application.Ai;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;

namespace TextStack.AiEvals;

/// <summary>
/// Translate golden eval: runs the real Translate prompt over a curated dataset and
/// scores each output with an LLM-as-judge. Opt-in — skips without OPENAI_API_KEY.
/// </summary>
[Trait("Category", "Eval")]
public class TranslateEvalTests(ITestOutputHelper output)
{
    private const double BootstrapBar = 3.5;

    private static readonly Rubric Rubric = new(
        "accuracy: does it convey the source meaning, using the domain sense when a genre/sentence is given?",
        "fluency: is it natural, grammatical target-language text?",
        "register: right domain register, and a short parenthetical clarifier only when the term is genuinely ambiguous?");

    [Fact]
    public async Task Translate_golden_set_meets_quality_bar()
    {
        var gen = EvalClients.OpenAi();
        var judge = new JudgeRunner(EvalClients.Judge());
        var ct = TestContext.Current.CancellationToken;

        var goldens = GoldenData.Load<TranslateGolden>("translate.json");
        Assert.True(goldens.Count >= 30, $"expected >=30 golden cases, got {goldens.Count}");

        var results = await new GoldenRunner(gen).RunAsync(goldens, ToRequest, ct);

        var scores = new List<JudgeScore>();
        foreach (var r in results)
        {
            var g = r.Case;
            var evidence =
                $"Text: {g.Text}\nDirection: {g.SourceLang} -> {g.TargetLang}\n" +
                $"Domain: {g.Genre ?? "(none)"}\nSentence: {g.Sentence ?? "(none)"}\n" +
                $"Reference translation: {g.ExpectedTranslation}\nActual translation: {r.Actual}";
            var score = await judge.JudgeAsync(Rubric, evidence, ct);
            scores.Add(score);
            output.WriteLine($"[{score.Mean:0.0}] {g.Text}→{g.TargetLang}: {score.D1}/{score.D2}/{score.D3} — {Trunc(r.Actual)}");
        }

        var s = JudgeRunner.Aggregate(scores);
        output.WriteLine($"\nN={s.N} accuracy={s.Mean1:0.00} fluency={s.Mean2:0.00} register={s.Mean3:0.00} OVERALL={s.MeanOverall:0.00}");
        await EvalRunRecorder.RecordAsync("translate", ollamaGen: false, Rubric, s, ct);
        Assert.True(s.MeanOverall >= BootstrapBar, $"Translate mean {s.MeanOverall:0.00} below bootstrap bar {BootstrapBar:0.0}");
    }

    private static LlmRequest ToRequest(TranslateGolden g) => new(
        SystemPrompt: TranslatePrompt.BuildSystemPrompt(g.SourceLang, g.TargetLang, g.Genre, g.Sentence),
        Messages: [new LlmMessage("user", g.Text)],
        MaxOutputTokens: 1000,
        FeatureTag: "translate");

    private static string Trunc(string str) => str.Length <= 60 ? str : str[..60] + "…";
}
