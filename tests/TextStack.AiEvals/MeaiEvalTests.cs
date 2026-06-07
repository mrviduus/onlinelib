using TextStack.Ai.EvalSuite;
using TextStack.Ai.Llm;

namespace TextStack.AiEvals;

/// <summary>
/// The golden suite run through Microsoft.Extensions.AI.Evaluation (the new path),
/// asserting the SAME per-feature floors as the legacy <see cref="EvalSuiteTests"/>.
/// Same goldens, same generation provider per feature, same judge — so a green run
/// here should match the legacy run (full old-vs-new comparison lands in Step 7).
/// Self-skips when a provider isn't available, exactly like the legacy suite.
/// </summary>
[Trait("Category", "Eval")]
public class MeaiEvalTests(ITestOutputHelper output)
{
    public static IEnumerable<object[]> Keys => EvalDefinitions.Keys.Select(k => new object[] { k });

    [Theory]
    [MemberData(nameof(Keys))]
    public async Task Feature_eval_meets_floor_via_MEAI(string key)
    {
        var ollamaGen = key is "vocab" or "bookmeta";
        var generator = ollamaGen ? EvalClients.Ollama() : EvalClients.OpenAi();   // skips if unavailable
        var judge = new LlmServiceChatClient(EvalClients.Judge(), defaultFeatureTag: "eval.judge");
        var ct = TestContext.Current.CancellationToken;

        var runner = new MeaiEvalRunner();
        var scores = await runner.RunAsync(
            generatorFor: _ => generator,
            judge: judge,
            keys: [key],
            storageRoot: EvalStorage.Root("report"),
            ct: ct);

        Assert.NotEmpty(scores);
        foreach (var s in scores)
        {
            output.WriteLine($"{s.Feature}: N={s.N} overall={s.MeanOverall:0.00}");
            var floor = MeaiEvalRunner.Floor(s.Feature);
            Assert.True(s.MeanOverall >= floor,
                $"{s.Feature} mean {s.MeanOverall:0.00} below floor {floor:0.0}");
        }
    }
}
