using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for the in-app <see cref="EvalSuiteRunner"/> — the runner the
/// admin "Run evals" button uses. Drives it with a fake generator + fake judge (no
/// Ollama/OpenAI) so it runs in CI, proving the repointed path works end to end:
/// generate → score via the MEAI <c>RubricEvaluator</c> (through the IChatClient adapter)
/// → read the axis metrics back → aggregate. Persistence is off (no db needed).
/// </summary>
public class EvalSuiteRunnerTests
{
    private sealed class FixedLlm(string reply) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            Task.FromResult(new LlmResponse(reply, [], new LlmUsage(0, 0, 0m), "fake-model", Guid.NewGuid()));

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    [Fact]
    public async Task RunAsync_scores_goldens_via_rubric_evaluator()
    {
        var ct = TestContext.Current.CancellationToken;
        var generator = new FixedLlm("GENRE: Fiction\nYEAR: 1900\nDESCRIPTION: A canned description.");
        var judge = new FixedLlm("{\"d1\": 4, \"d2\": 3, \"d3\": 5, \"rationale\": \"ok\"}");

        var runner = new EvalSuiteRunner(NullLogger<EvalSuiteRunner>.Instance);
        var results = await runner.RunAsync(
            generatorFor: _ => generator,
            judgeClient: judge,
            judgeModelId: "judge-test",
            keys: ["bookmeta"],
            persist: false,
            db: null,
            gitSha: null,
            ct: ct);

        var r = Assert.Single(results);
        Assert.Equal("bookmeta", r.Feature);
        Assert.Equal("fake-model", r.ModelId);
        Assert.Equal(30, r.Summary.N);                          // bookmeta golden set
        Assert.Equal((4 + 3 + 5) / 3.0, r.Summary.MeanOverall, 3); // 4.00 for every case
        Assert.Equal(4.0, r.Summary.Mean1, 3);
        Assert.Equal(3.0, r.Summary.Mean2, 3);
        Assert.Equal(5.0, r.Summary.Mean3, 3);
    }

    [Fact]
    public async Task RunAsync_DefaultRunType_PersistsManual()
    {
        var ct = TestContext.Current.CancellationToken;
        var generator = new FixedLlm("GENRE: Fiction\nYEAR: 1900\nDESCRIPTION: A canned description.");
        var judge = new FixedLlm("{\"d1\": 4, \"d2\": 3, \"d3\": 5, \"rationale\": \"ok\"}");
        var db = new CapturingDb();

        var runner = new EvalSuiteRunner(NullLogger<EvalSuiteRunner>.Instance);
        await runner.RunAsync(
            generatorFor: _ => generator,
            judgeClient: judge,
            judgeModelId: "judge-test",
            keys: ["bookmeta"],
            persist: true,
            db: db,
            gitSha: null,
            ct: ct); // runType omitted → defaults to "manual"

        var run = Assert.Single(db.Added);
        Assert.Equal("manual", run.RunType);
    }

    [Fact]
    public async Task RunAsync_ScheduledRunType_PersistsScheduled()
    {
        var ct = TestContext.Current.CancellationToken;
        var generator = new FixedLlm("GENRE: Fiction\nYEAR: 1900\nDESCRIPTION: A canned description.");
        var judge = new FixedLlm("{\"d1\": 4, \"d2\": 3, \"d3\": 5, \"rationale\": \"ok\"}");
        var db = new CapturingDb();

        var runner = new EvalSuiteRunner(NullLogger<EvalSuiteRunner>.Instance);
        await runner.RunAsync(
            generatorFor: _ => generator,
            judgeClient: judge,
            judgeModelId: "judge-test",
            keys: ["bookmeta"],
            persist: true,
            db: db,
            gitSha: null,
            ct: ct,
            runType: "scheduled");

        var run = Assert.Single(db.Added);
        Assert.Equal("scheduled", run.RunType);
    }
}
