using Microsoft.Extensions.AI;
using Microsoft.Extensions.AI.Evaluation;
using Microsoft.Extensions.AI.Evaluation.Reporting;
using Microsoft.Extensions.AI.Evaluation.Reporting.Storage;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Evals;

namespace TextStack.AiEvals;

/// <summary>Aggregate score for one facet feature after a MEAI run (mirrors the
/// legacy <c>EvalRunResult</c> shape so old/new are directly comparable).</summary>
internal sealed record MeaiFeatureScore(string Feature, double MeanOverall, int N);

/// <summary>
/// Runs the golden suite through Microsoft.Extensions.AI.Evaluation, reusing the
/// SAME goldens (<see cref="EvalDefinitions"/> + <see cref="GoldenLoader"/>), the SAME
/// generation (each unit generated once via its real <see cref="ILlmService"/>), and the
/// SAME judge logic (<see cref="RubricEvaluator"/> = parity port of <see cref="JudgeRunner"/>).
///
/// <para>One <see cref="ReportingConfiguration"/> per facet feature (its single rubric
/// evaluator); one <see cref="ScenarioRun"/> per golden case. Disposing each run persists
/// it to the disk store under <paramref name="storageRoot"/>, which also caches judge
/// responses so reruns don't re-hit the LLM.</para>
/// </summary>
internal sealed class MeaiEvalRunner
{
    public async Task<IReadOnlyList<MeaiFeatureScore>> RunAsync(
        Func<string, ILlmService> generatorFor,
        IChatClient judge,
        IEnumerable<string>? keys,
        string storageRoot,
        CancellationToken ct)
    {
        var defs = EvalDefinitions.Build(keys);
        var chatConfig = new ChatConfiguration(judge);
        var configs = new Dictionary<string, ReportingConfiguration>();
        var scores = new Dictionary<string, List<double>>();

        foreach (var def in defs)
        {
            var caseIdx = 0;
            foreach (var unit in def.Units)
            {
                ct.ThrowIfCancellationRequested();
                var generated = await generatorFor(unit.Request.FeatureTag ?? def.Key).CompleteAsync(unit.Request, ct);
                var modelResponse = new ChatResponse(new ChatMessage(ChatRole.Assistant, generated.Text));
                var messages = ToMessages(unit.Request);

                foreach (var facet in unit.Facets)
                {
                    if (!configs.TryGetValue(facet.Feature, out var config))
                        configs[facet.Feature] = config = DiskBasedReportingConfiguration.Create(
                            storageRootPath: storageRoot,
                            evaluators: [new RubricEvaluator(facet.Feature, facet.Rubric, Floor(facet.Feature))],
                            chatConfiguration: chatConfig);

                    await using var run = await config.CreateScenarioRunAsync(
                        $"{facet.Feature}.case{caseIdx}", cancellationToken: ct);

                    var result = await run.EvaluateAsync(
                        messages, modelResponse, [new RubricEvidenceContext(facet.Evidence(generated.Text))], ct);

                    var overall = result.Get<NumericMetric>($"{facet.Feature}.overall").Value ?? 0d;
                    if (!scores.TryGetValue(facet.Feature, out var list))
                        scores[facet.Feature] = list = [];
                    list.Add(overall);
                }

                caseIdx++;
            }
        }

        return scores.Select(kv => new MeaiFeatureScore(kv.Key, kv.Value.Average(), kv.Value.Count)).ToList();
    }

    /// <summary>Same floor the legacy <c>EvalSuiteTests</c> asserts: OpenAI-backed
    /// explain/translate hold 3.5; the smaller local models hold 3.0.</summary>
    public static double Floor(string feature) =>
        feature is "explain" or "translate" ? 3.5 : 3.0;

    private static List<ChatMessage> ToMessages(LlmRequest request)
    {
        var messages = new List<ChatMessage>();
        if (!string.IsNullOrWhiteSpace(request.SystemPrompt))
            messages.Add(new ChatMessage(ChatRole.System, request.SystemPrompt));
        foreach (var m in request.Messages)
            messages.Add(new ChatMessage(new ChatRole(m.Role), m.Content));
        return messages;
    }
}
