using Microsoft.Extensions.AI;
using Microsoft.Extensions.AI.Evaluation;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;

namespace TextStack.AiEvals;

/// <summary>
/// Parity tests for <see cref="RubricEvaluator"/> — proves it derives the SAME score
/// from a judge response that the legacy <see cref="JudgeRunner"/> would, exercised
/// through the real <see cref="LlmServiceChatClient"/> seam. Deterministic (the judge
/// is a fake returning canned text), so these always run.
/// </summary>
public class RubricEvaluatorTests
{
    private static readonly Rubric TestRubric = new(
        "accuracy: matches meaning?",
        "conciseness: short?",
        "usefulness: helpful?");

    private sealed class FakeJudge(string reply) : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            Task.FromResult(new LlmResponse(reply, [], new LlmUsage(0, 0, 0m), "judge-test", Guid.NewGuid()));

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static async Task<EvaluationResult> Evaluate(string judgeReply, string id = "explain", double? floor = null)
    {
        var judge = new LlmServiceChatClient(new FakeJudge(judgeReply), defaultFeatureTag: "eval.judge");
        var evaluator = new RubricEvaluator(id, TestRubric, floor);
        return await evaluator.EvaluateAsync(
            messages: [new ChatMessage(ChatRole.User, "ignored — evidence comes via context")],
            modelResponse: new ChatResponse(new ChatMessage(ChatRole.Assistant, "the generated output")),
            chatConfiguration: new ChatConfiguration(judge),
            additionalContext: [new RubricEvidenceContext("Reference: X\nActual: Y")],
            cancellationToken: TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task Metrics_match_JudgeRunner_parse_for_same_reply()
    {
        const string reply = "{\"d1\": 4, \"d2\": 5, \"d3\": 3, \"rationale\": \"solid\"}";
        var expected = JudgeRunner.ParseScore(reply);   // legacy path's score for the same text

        var result = await Evaluate(reply);

        Assert.Equal(expected.D1, result.Get<NumericMetric>("explain.accuracy").Value);
        Assert.Equal(expected.D2, result.Get<NumericMetric>("explain.conciseness").Value);
        Assert.Equal(expected.D3, result.Get<NumericMetric>("explain.usefulness").Value);
        Assert.Equal(expected.Mean, result.Get<NumericMetric>("explain.overall").Value);   // (4+5+3)/3
    }

    [Fact]
    public async Task Overall_floor_interpretation_passes_and_fails_like_the_old_assert()
    {
        // mean 4.0 ≥ floor 3.5 → pass
        var pass = await Evaluate("{\"d1\":4,\"d2\":4,\"d3\":4}", floor: 3.5);
        Assert.False(pass.Get<NumericMetric>("explain.overall").Interpretation!.Failed);

        // mean 2.0 < floor 3.5 → fail
        var fail = await Evaluate("{\"d1\":2,\"d2\":2,\"d3\":2}", floor: 3.5);
        Assert.True(fail.Get<NumericMetric>("explain.overall").Interpretation!.Failed);
    }

    [Fact]
    public async Task Unparseable_reply_yields_zeros_and_a_diagnostic()
    {
        var result = await Evaluate("the judge rambled with no json", floor: 3.0);

        var overall = result.Get<NumericMetric>("explain.overall");
        Assert.Equal(0d, overall.Value);
        Assert.True(overall.Interpretation!.Failed);
        Assert.Contains(overall.Diagnostics!, d => d.Severity == EvaluationDiagnosticSeverity.Warning);
    }

    [Fact]
    public async Task Metric_names_are_prefixed_by_id_to_avoid_facet_collisions()
    {
        var result = await Evaluate("{\"d1\":3,\"d2\":3,\"d3\":3}", id: "vocab.hint");
        Assert.Contains("vocab.hint.overall", result.Metrics.Keys);
        Assert.Contains("vocab.hint.accuracy", result.Metrics.Keys);
    }
}
