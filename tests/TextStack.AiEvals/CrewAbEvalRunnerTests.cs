using System.Text.Json;
using Application.Agents;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="CrewAbEvalRunner"/> (AI-046) — NO key, NO network. A fake generator
/// routes per FeatureTag: <c>crew.baseline</c> → the single-call (A) text + its cost; the crew tags
/// (<c>crew.researcher/drafter/critic/editor</c>) → B's sub-agent texts + their cost. A fake JUDGE runs through
/// the REAL <see cref="TextStack.Ai.Evals.RubricEvaluator"/> and returns canned 1-5 scores keyed on WHICH
/// candidate text is in the prompt (A's marker vs B's editor marker), so the runner's lift / cost-ratio / gate
/// math is exercised end-to-end. Asserts the four gate scenarios, the crew-halt 0-score, and EvalRun persistence.
/// </summary>
public class CrewAbEvalRunnerTests
{
    private static readonly int GoldenN = CrewAbGoldenSet.Load().Count;

    // Distinct markers so the judge can tell the two arms apart purely from the candidate text in its prompt.
    private const string AMarker = "BASELINE_A_CANDIDATE";
    private const string BMarker = "CREW_B_EDITED_CANDIDATE";

    // A clean critic verdict so the crew completes through the editor (B's EditedText is non-null).
    private const string CleanCritic =
        """{"scores":{"factual_accuracy":5,"tone":5,"length":5,"banned_phrases":5},"issues":[]}""";

    private static CrewAbEvalRunner Runner() => new(NullLogger<CrewAbEvalRunner>.Instance);

    // ---- Fake generator: routes A vs the four crew specialists, with per-arm cost ------------------

    /// <summary>
    /// One fake <see cref="ILlmService"/> driving BOTH arms: <c>crew.baseline</c> emits A's marker text at
    /// <paramref name="baselineCost"/>; each crew specialist emits its canned text, and the per-call crew cost is
    /// <paramref name="crewCostEach"/> (4 calls → crew total ≈ 4× that). The editor emits B's marker so the judge
    /// can score B's edited candidate.
    /// </summary>
    private sealed class FakeGenerator(decimal baselineCost, decimal crewCostEach) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var (text, cost) = request.FeatureTag switch
            {
                "crew.baseline" => (AMarker, baselineCost),
                "crew.researcher" => ("- a grounded fact\n- another fact", crewCostEach),
                "crew.drafter" => ("A drafted candidate.", crewCostEach),
                "crew.critic" => (CleanCritic, crewCostEach),
                "crew.editor" => (BMarker, crewCostEach),
                _ => throw new InvalidOperationException($"Unexpected feature tag: {request.FeatureTag}"),
            };
            return Task.FromResult(new LlmResponse(text, [], new LlmUsage(40, 20, cost), "fake-gen", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    // ---- Fake judge (through the real RubricEvaluator): canned scores per candidate marker -----------

    /// <summary>
    /// Returns a fixed 3-axis verdict for A's candidate and another for B's, detected by the marker present in
    /// the judge prompt. The runner judges in separate calls, so each call carries exactly one candidate.
    /// </summary>
    private sealed class MarkerJudge(int a1, int a2, int a3, int b1, int b2, int b3) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var prompt = string.Join("\n", request.Messages.Select(m => m.Content));
            var isB = prompt.Contains(BMarker, StringComparison.Ordinal);
            var (d1, d2, d3) = isB ? (b1, b2, b3) : (a1, a2, a3);
            return Task.FromResult(new LlmResponse(
                $"{{\"d1\": {d1}, \"d2\": {d2}, \"d3\": {d3}, \"rationale\": \"ok\"}}",
                [], new LlmUsage(0, 0, 0m), "fake-judge", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class RecordingAgentRunWriter : IAgentRunWriter
    {
        public Task WriteAsync(AgentRunRecord run, CancellationToken ct) => Task.CompletedTask;
    }

    private static FieldCrew Crew(ILlmService gen) =>
        new(new CrewOrchestrator(),
            new ResearcherAgent(gen),
            new DrafterAgent(gen),
            new CriticAgent(gen),
            new EditorAgent(gen),
            new RecordingAgentRunWriter());

    private static BaselineFieldAgent Baseline(ILlmService gen) => new(gen);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- 1. B far better, cost in budget → passes ---------------------------------------------------

    [Fact]
    public async Task RunAsync_BFarBetter_Passes()
    {
        // B scores 5 across the board, A scores 3 → lift = (5-3)/3 ≈ 0.667. Crew cost (4 × 0.001 = 0.004) is
        // exactly 2× the baseline (0.002) → ratio == 2.0 ≤ gate. Both gates clear.
        var gen = new FakeGenerator(baselineCost: 0.002m, crewCostEach: 0.001m);
        var judge = new MarkerJudge(3, 3, 3, 5, 5, 5);

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: false, db: null, gitSha: null, Ct);

        Assert.Equal(GoldenN, result.N);
        Assert.Equal(3.0, result.AvgA, 6);
        Assert.Equal(5.0, result.AvgB, 6);
        Assert.Equal((5.0 - 3.0) / 3.0, result.LiftPct, 6);
        Assert.Equal(2.0, result.CostRatio, 6);
        Assert.Equal(1.0, result.WinRate, 6);
        Assert.True(result.LiftPct >= CrewAbEvalRunner.LiftGate);
        Assert.True(result.CostRatio <= CrewAbEvalRunner.CostRatioGate);
        Assert.True(result.Passed);
    }

    // ---- 2. B not better (A == B) → fails on lift ---------------------------------------------------

    [Fact]
    public async Task RunAsync_BNotBetter_Fails()
    {
        var gen = new FakeGenerator(baselineCost: 0.002m, crewCostEach: 0.0005m); // crew cheaper, cost gate fine
        var judge = new MarkerJudge(4, 4, 4, 4, 4, 4); // identical → lift 0

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: false, db: null, gitSha: null, Ct);

        Assert.Equal(0.0, result.LiftPct, 6);
        Assert.Equal(0.0, result.WinRate, 6);
        Assert.True(result.LiftPct < CrewAbEvalRunner.LiftGate);
        Assert.False(result.Passed); // cost is fine, but no lift → gate fails
    }

    // ---- 3. B better but too expensive → fails on cost (independent of lift) ------------------------

    [Fact]
    public async Task RunAsync_BBetterButTooExpensive_Fails()
    {
        // B clearly better (lift would pass) but the crew costs > 2× the baseline → cost gate fails alone.
        var gen = new FakeGenerator(baselineCost: 0.001m, crewCostEach: 0.001m); // crew total 0.004 = 4× baseline
        var judge = new MarkerJudge(3, 3, 3, 5, 5, 5);

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: false, db: null, gitSha: null, Ct);

        Assert.True(result.LiftPct >= CrewAbEvalRunner.LiftGate); // lift alone would pass
        Assert.Equal(4.0, result.CostRatio, 6);
        Assert.True(result.CostRatio > CrewAbEvalRunner.CostRatioGate);
        Assert.False(result.Passed); // cost gate is independent — fails despite the lift
    }

    // ---- 4. B worse → negative lift, fails ----------------------------------------------------------

    [Fact]
    public async Task RunAsync_BWorse_NegativeLift_Fails()
    {
        var gen = new FakeGenerator(baselineCost: 0.002m, crewCostEach: 0.0005m);
        var judge = new MarkerJudge(5, 5, 5, 2, 2, 2); // A beats B

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: false, db: null, gitSha: null, Ct);

        Assert.True(result.LiftPct < 0);
        Assert.Equal((2.0 - 5.0) / 5.0, result.LiftPct, 6);
        Assert.Equal(0.0, result.WinRate, 6);
        Assert.False(result.Passed);
    }

    // ---- 5. Crew halted (null EditedText) → B scores 0 for that case --------------------------------

    [Fact]
    public async Task RunAsync_CrewHalted_NullEditedText_ScoresZero()
    {
        // Crew cost per call busts the per-field cap → the orchestrator halts after research, before the editor,
        // so EditedText is null and the runner scores B = 0 WITHOUT calling the judge for B. A still scores 3.
        var gen = new FakeGenerator(baselineCost: 0.002m, crewCostEach: AutoPublishCrew.CostCapUsd + 0.01m);
        var judge = new MarkerJudge(3, 3, 3, 5, 5, 5); // B markers never reach the judge (no edited text)

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: false, db: null, gitSha: null, Ct);

        Assert.Equal(3.0, result.AvgA, 6);
        Assert.Equal(0.0, result.AvgB, 6); // every B halted → 0
        Assert.All(result.Cases, c => Assert.Equal(0.0, c.JudgeScoreB, 6));
        Assert.True(result.LiftPct < 0); // (0-3)/3 = -1
        Assert.False(result.Passed);
    }

    // ---- 5b. Zero baseline judge score → lift guarded to 0 (no div-by-zero), gate fails -------------

    [Fact]
    public async Task RunAsync_ZeroBaselineScore_LiftGuardedToZero_Fails()
    {
        // avgA == 0 (judge scores A all-zeros). liftPct must be guarded to 0, NOT NaN/+inf, and the gate must
        // fail — a zero baseline is not a free pass for the crew.
        var gen = new FakeGenerator(baselineCost: 0.002m, crewCostEach: 0.0005m);
        var judge = new MarkerJudge(0, 0, 0, 5, 5, 5);

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: false, db: null, gitSha: null, Ct);

        Assert.Equal(0.0, result.AvgA, 6);
        Assert.Equal(5.0, result.AvgB, 6);
        Assert.Equal(0.0, result.LiftPct, 6); // guarded, not (5-0)/0
        Assert.False(double.IsNaN(result.LiftPct));
        Assert.False(double.IsInfinity(result.LiftPct));
        Assert.False(result.Passed);
    }

    // ---- 5c. Zero baseline spend → costRatio = +inf (no div-by-zero), gate fails, JSON null --------

    [Fact]
    public async Task RunAsync_ZeroBaselineCost_CostRatioInfinite_Fails()
    {
        // sumCostA == 0 (baseline reports zero cost). costRatio must be +inf (not NaN/0), the gate must FAIL
        // (a free baseline makes any crew spend an infinite multiple), and the persisted JSON must stay
        // parseable — +inf serializes to JSON null, never a bare `Infinity` literal.
        var db = new CapturingDb();
        var gen = new FakeGenerator(baselineCost: 0m, crewCostEach: 0.001m);
        var judge = new MarkerJudge(3, 3, 3, 5, 5, 5); // lift alone would pass

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-test", persist: true, db, gitSha: null, Ct);

        Assert.True(result.LiftPct >= CrewAbEvalRunner.LiftGate); // lift would pass on its own
        Assert.True(double.IsPositiveInfinity(result.CostRatio));
        Assert.False(result.Passed); // cost gate fails on infinite ratio

        var run = Assert.Single(db.Added);
        using var doc = JsonDocument.Parse(run.BreakdownJson!); // must not throw on +inf
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("costRatio").ValueKind);
    }

    // ---- 6. Persistence ----------------------------------------------------------------------------

    [Fact]
    public async Task RunAsync_Persist_WritesCrewAbEvalRun()
    {
        var db = new CapturingDb();
        var gen = new FakeGenerator(baselineCost: 0.002m, crewCostEach: 0.001m);
        var judge = new MarkerJudge(3, 3, 3, 5, 5, 5);

        var result = await Runner().RunAsync(
            Baseline(gen), Crew(gen), judge, "judge-model-x", persist: true, db, gitSha: "abc123", Ct);

        var run = Assert.Single(db.Added);
        Assert.Equal("crew_ab", run.Feature);
        Assert.Equal("judge-model-x", run.JudgeModelId);
        Assert.Equal("abc123", run.GitSha);
        Assert.Equal(GoldenN, run.N);
        Assert.Equal(Math.Round((decimal)result.LiftPct, 3), run.Score);

        using var doc = JsonDocument.Parse(run.BreakdownJson!);
        var root = doc.RootElement;
        Assert.True(root.TryGetProperty("avgA", out _));
        Assert.True(root.TryGetProperty("avgB", out _));
        Assert.True(root.TryGetProperty("liftPct", out _));
        Assert.True(root.TryGetProperty("costRatio", out _));
        Assert.True(root.TryGetProperty("winRate", out _));
        Assert.Equal(GoldenN, root.GetProperty("n").GetInt32());

        var perFixture = root.GetProperty("perFixture");
        Assert.Equal(GoldenN, perFixture.GetArrayLength());
        var first = perFixture[0];
        Assert.True(first.TryGetProperty("id", out _));
        Assert.True(first.TryGetProperty("scoreA", out _));
        Assert.True(first.TryGetProperty("scoreB", out _));
        Assert.True(first.TryGetProperty("bWins", out _));
    }
}
