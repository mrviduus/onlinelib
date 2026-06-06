using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;

namespace TextStack.AiEvals;

/// <summary>
/// Opt-in eval suite, now driven by the in-app <see cref="EvalSuiteRunner"/> (the same
/// runner the admin "Run evals" button uses) so there is one source of truth for
/// goldens, prompts and rubrics. Generation uses each feature's real provider
/// (explain/translate→OpenAI, vocab/bookmeta→Ollama); judge via EVAL_JUDGE
/// (default OpenAI, set ollama for free local). Self-skips when a provider isn't
/// available, so default CI stays green. Persistence is off here (persist:false).
/// </summary>
[Trait("Category", "Eval")]
public class EvalSuiteTests(ITestOutputHelper output)
{
    public static IEnumerable<object[]> Keys => EvalDefinitions.Keys.Select(k => new object[] { k });

    [Theory]
    [MemberData(nameof(Keys))]
    public async Task Feature_eval_meets_floor(string key)
    {
        var ollamaGen = key is "vocab" or "bookmeta";
        var generator = ollamaGen ? EvalClients.Ollama() : EvalClients.OpenAi(); // skips if unavailable
        var judge = EvalClients.Judge();                                          // skips per provider
        var ct = TestContext.Current.CancellationToken;

        var runner = new EvalSuiteRunner(NullLogger<EvalSuiteRunner>.Instance);
        var results = await runner.RunAsync(
            generatorFor: _ => generator,
            judgeClient: judge,
            judgeModelId: "test",
            keys: [key],
            persist: false,
            db: null,
            gitSha: null,
            ct);

        Assert.NotEmpty(results);
        foreach (var r in results)
        {
            output.WriteLine($"{r.Feature}: N={r.Summary.N} overall={r.Summary.MeanOverall:0.00} (model={r.ModelId})");
            var floor = Floor(r.Feature);
            Assert.True(r.Summary.MeanOverall >= floor,
                $"{r.Feature} mean {r.Summary.MeanOverall:0.00} below floor {floor:0.0}");
        }
    }

    // OpenAI-backed features hold a higher floor than the smaller local Ollama model.
    private static double Floor(string feature) => feature is "explain" or "translate" ? 3.5 : 3.0;
}
