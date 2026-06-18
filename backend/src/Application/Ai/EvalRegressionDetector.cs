namespace Application.Ai;

/// <summary>One flagged regression: a feature+model whose score dropped at least the
/// configured threshold versus its prior scheduled run.</summary>
public readonly record struct EvalRegression(
    string Feature,
    string ModelId,
    double PriorScore,
    double CurrentScore,
    double Drop);

/// <summary>
/// Pure regression check (Phase 12 RLOps slice 5a): compares the prior scheduled eval scores
/// against the just-written current scores. For each (feature, model) present in BOTH sets, a
/// drop of <c>dropThreshold</c> or more (prior − current) is a regression. A feature with no
/// prior is never flagged (first scheduled run can't regress). No deps — unit-testable.
/// </summary>
public sealed class EvalRegressionDetector
{
    public IReadOnlyList<EvalRegression> Detect(
        IReadOnlyList<(string Feature, string ModelId, double Score)> prior,
        IReadOnlyList<(string Feature, string ModelId, double Score)> current,
        double dropThreshold)
    {
        // Index prior by (feature, model). If duplicates exist, the first wins (callers pass
        // one row per pair, but be defensive).
        var priorByKey = new Dictionary<(string, string), double>();
        foreach (var p in prior)
            priorByKey.TryAdd((p.Feature, p.ModelId), p.Score);

        var regressions = new List<EvalRegression>();
        foreach (var c in current)
        {
            if (!priorByKey.TryGetValue((c.Feature, c.ModelId), out var priorScore))
                continue; // no prior for this feature+model → can't regress

            var drop = priorScore - c.Score;
            if (drop >= dropThreshold)
                regressions.Add(new EvalRegression(c.Feature, c.ModelId, priorScore, c.Score, drop));
        }

        return regressions;
    }
}
