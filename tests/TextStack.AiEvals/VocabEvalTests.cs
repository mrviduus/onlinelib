using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Vocabulary;

namespace TextStack.AiEvals;

/// <summary>
/// Vocabulary golden eval: one Ollama call per case produces distractors + hint +
/// explanation (the real DistractorPrompt), then three LLM-as-judge passes (OpenAI)
/// score each facet on its own rubric. Opt-in — skips unless Ollama is reachable AND
/// OPENAI_API_KEY is set (generation = Ollama, judge = OpenAI).
/// </summary>
[Trait("Category", "Eval")]
public class VocabEvalTests(ITestOutputHelper output)
{
    // gemma (small, local) sets a lower bootstrap bar than the OpenAI features.
    private const double BootstrapBar = 3.0;

    private static readonly Rubric DistractorRubric = new(
        "plausibility: are the 5 distractors real words that could plausibly confuse a learner (same part of speech, similar difficulty)?",
        "distinctness: are they clearly WRONG (not synonyms of the target) and distinct from one another?",
        "difficulty: single words, similar register to the target — not trivially eliminable?");

    private static readonly Rubric HintRubric = new(
        "helpfulness: does the hint point at the meaning?",
        "no-spoiler: does it avoid using the target word or a direct synonym?",
        "brevity: one short sentence, roughly under 15 words?");

    private static readonly Rubric ExplanationRubric = new(
        "accuracy: does it correctly explain the word (and its use in context if given)?",
        "clarity: clear and learner-friendly, 2-3 sentences?",
        "nativeness: written fluently in the requested native language?");

    [Fact]
    public async Task Vocab_golden_set_meets_quality_bar()
    {
        var gen = EvalClients.Ollama();    // skips if Ollama not running
        var judgeClient = EvalClients.OpenAi(); // skips if no OPENAI_API_KEY
        var ct = TestContext.Current.CancellationToken;

        var goldens = GoldenData.Load<VocabGolden>("vocab.json");
        Assert.True(goldens.Count >= 30, $"expected >=30 golden cases, got {goldens.Count}");

        var results = await new GoldenRunner(gen).RunAsync(goldens, ToRequest, ct);
        var judge = new JudgeRunner(judgeClient);

        var distractor = new List<JudgeScore>();
        var hint = new List<JudgeScore>();
        var explanation = new List<JudgeScore>();

        foreach (var r in results)
        {
            var g = r.Case;
            distractor.Add(await judge.JudgeAsync(DistractorRubric,
                $"Target word: {g.Word}\nReference distractors: {string.Join(", ", g.ExpectedDistractors)}\n" +
                $"Model output (evaluate the DISTRACTORS line):\n{r.Actual}", ct));
            hint.Add(await judge.JudgeAsync(HintRubric,
                $"Target word: {g.Word}\nReference hint: {g.ExpectedHint}\n" +
                $"Model output (evaluate the HINT line):\n{r.Actual}", ct));
            explanation.Add(await judge.JudgeAsync(ExplanationRubric,
                $"Target word: {g.Word}\nNative language: {g.NativeLanguage}\nReference explanation: {g.ExpectedExplanation}\n" +
                $"Model output (evaluate the EXPLANATION line):\n{r.Actual}", ct));
            output.WriteLine($"{g.Word}: distractor={distractor[^1].Mean:0.0} hint={hint[^1].Mean:0.0} explanation={explanation[^1].Mean:0.0}");
        }

        Report("distractor", distractor);
        Report("hint", hint);
        Report("explanation", explanation);

        Assert.True(JudgeRunner.Aggregate(distractor).MeanOverall >= BootstrapBar, "distractor below bootstrap bar");
        Assert.True(JudgeRunner.Aggregate(hint).MeanOverall >= BootstrapBar, "hint below bootstrap bar");
        Assert.True(JudgeRunner.Aggregate(explanation).MeanOverall >= BootstrapBar, "explanation below bootstrap bar");
    }

    private void Report(string facet, IReadOnlyCollection<JudgeScore> scores)
    {
        var s = JudgeRunner.Aggregate(scores);
        output.WriteLine($"{facet}: N={s.N} {s.Mean1:0.00}/{s.Mean2:0.00}/{s.Mean3:0.00} OVERALL={s.MeanOverall:0.00}");
    }

    private static LlmRequest ToRequest(VocabGolden g)
    {
        var (system, user) = DistractorPrompt.Build(g.Word, g.Language, g.Definition, g.Sentence, g.NativeLanguage);
        return new LlmRequest(system, [new LlmMessage("user", user)], MaxOutputTokens: 600, FeatureTag: "distractor");
    }
}
