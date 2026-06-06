using System.Text.Json;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;

namespace TextStack.Ai.EvalSuite;

/// <summary>
/// Runs the eval suite in-process so the admin "Run evals" button works on prod.
/// Generation goes through <paramref name="generatorFor"/> (the real ModelGateway,
/// routed by FeatureTag → OpenAI/Ollama exactly like prod); judging via
/// <paramref name="judgeClient"/> (Ollama by default = free). Persists one
/// <see cref="EvalRun"/> per feature when <c>persist</c> + a db are supplied.
/// </summary>
public sealed class EvalSuiteRunner(ILogger<EvalSuiteRunner> logger)
{
    public async Task<IReadOnlyList<EvalRunResult>> RunAsync(
        Func<string, ILlmService> generatorFor,
        ILlmService judgeClient,
        string judgeModelId,
        IEnumerable<string>? keys,
        bool persist,
        IAppDbContext? db,
        string? gitSha,
        CancellationToken ct)
    {
        var defs = EvalDefinitions.Build(keys);
        var judge = new JudgeRunner(judgeClient);
        var results = new List<EvalRunResult>();

        foreach (var def in defs)
        {
            // feature → (rubric, generation modelId, scores)
            var acc = new Dictionary<string, (Rubric Rubric, string ModelId, List<JudgeScore> Scores)>();

            foreach (var unit in def.Units)
            {
                ct.ThrowIfCancellationRequested();
                var resp = await generatorFor(unit.Request.FeatureTag).CompleteAsync(unit.Request, ct);
                foreach (var facet in unit.Facets)
                {
                    var score = await judge.JudgeAsync(facet.Rubric, facet.Evidence(resp.Text), ct);
                    if (!acc.TryGetValue(facet.Feature, out var entry))
                        acc[facet.Feature] = entry = (facet.Rubric, resp.ModelId, new List<JudgeScore>());
                    entry.Scores.Add(score);
                }
            }

            foreach (var (feature, entry) in acc)
            {
                var summary = JudgeRunner.Aggregate(entry.Scores);
                results.Add(new EvalRunResult(feature, entry.ModelId, summary));
                logger.LogInformation("Eval {Feature}: N={N} overall={Score:0.00}", feature, summary.N, summary.MeanOverall);

                if (persist && db is not null)
                {
                    db.EvalRuns.Add(new EvalRun
                    {
                        Id = Guid.NewGuid(),
                        Feature = feature,
                        ModelId = entry.ModelId,
                        JudgeModelId = judgeModelId,
                        Score = Math.Round((decimal)summary.MeanOverall, 3),
                        N = summary.N,
                        BreakdownJson = Breakdown(entry.Rubric, summary),
                        GitSha = gitSha,
                        CreatedAt = DateTimeOffset.UtcNow,
                    });
                }
            }

            if (persist && db is not null)
                await db.SaveChangesAsync(ct);
        }

        return results;
    }

    private static string Breakdown(Rubric r, EvalSummary s) => JsonSerializer.Serialize(new Dictionary<string, double>
    {
        [Label(r.Dim1)] = Math.Round(s.Mean1, 2),
        [Label(r.Dim2)] = Math.Round(s.Mean2, 2),
        [Label(r.Dim3)] = Math.Round(s.Mean3, 2),
    });

    private static string Label(string dim) => dim.Split(':')[0].Trim();
}
