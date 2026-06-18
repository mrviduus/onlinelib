namespace Application.Ai;

/// <summary>Result of the drift alert state machine for one day's centroid.</summary>
/// <param name="ConsecutiveBreaches">New running count of consecutive breaching days.</param>
/// <param name="AlertState">"ok" | "warning" | "alerting".</param>
/// <param name="ShouldAlert">True only the moment a streak first reaches <c>alerting</c>
/// AND no alert has already fired for this streak (debounce — alert once per streak).</param>
public readonly record struct DriftDecision(
    int ConsecutiveBreaches,
    string AlertState,
    bool ShouldAlert);

/// <summary>
/// Pure embedding-drift math (Phase 12 RLOps slice 5b). No EF, no embeddings, no config — every
/// member is a static pure function so the whole thing is unit-testable. The DriftDetectionWorker
/// supplies the vectors (sampled + embedded prompts) and persistence; this just does the algebra:
/// mean-pool a day's vectors into a centroid, cosine-drift today vs the baseline, and run the
/// consecutive-breach alert state machine.
/// </summary>
public static class DriftCalculator
{
    /// <summary>Element-wise mean of the vectors (the day's centroid). Empty input → empty array.
    /// Mixed lengths are clamped to the shortest (defensive — all embeddings are 1536-d in practice).</summary>
    public static float[] MeanPool(IReadOnlyList<float[]> vectors)
    {
        if (vectors.Count == 0)
            return [];

        var dim = int.MaxValue;
        foreach (var v in vectors)
            dim = Math.Min(dim, v.Length);
        if (dim == 0)
            return [];

        var sum = new double[dim];
        foreach (var v in vectors)
            for (var i = 0; i < dim; i++)
                sum[i] += v[i];

        var mean = new float[dim];
        for (var i = 0; i < dim; i++)
            mean[i] = (float)(sum[i] / vectors.Count);
        return mean;
    }

    /// <summary>Cosine drift = 1 − cosine similarity. Identical vectors → 0, orthogonal → 1,
    /// opposite → 2. Returns 0 if either vector is zero-norm or lengths mismatch (no signal,
    /// fail-safe so a degenerate centroid never raises a false alert).</summary>
    public static double CosineDrift(float[] a, float[] b)
    {
        if (a.Length == 0 || a.Length != b.Length)
            return 0;

        double dot = 0, normA = 0, normB = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += (double)a[i] * b[i];
            normA += (double)a[i] * a[i];
            normB += (double)b[i] * b[i];
        }

        if (normA <= 0 || normB <= 0)
            return 0;

        var cosine = dot / (Math.Sqrt(normA) * Math.Sqrt(normB));
        return 1.0 - cosine;
    }

    /// <summary>
    /// Consecutive-breach alert state machine. A day breaches when its <paramref name="driftScore"/>
    /// is at or above <paramref name="threshold"/>; that increments the streak (else it resets to 0).
    /// State is <c>alerting</c> once the streak reaches <paramref name="consecutiveDaysToAlert"/>,
    /// <c>warning</c> on any active streak (≥1), else <c>ok</c>. An alert fires only the moment the
    /// streak first crosses into <c>alerting</c> and no alert has already fired for it
    /// (<paramref name="alreadyAlertedThisStreak"/>) — so a sustained drift pages once, not daily.
    /// </summary>
    public static DriftDecision Decide(
        int priorConsecutiveBreaches,
        double driftScore,
        double threshold,
        int consecutiveDaysToAlert,
        bool alreadyAlertedThisStreak)
    {
        var breaching = driftScore >= threshold;
        var breaches = breaching ? priorConsecutiveBreaches + 1 : 0;
        var daysToAlert = Math.Max(1, consecutiveDaysToAlert);

        string state;
        if (breaches >= daysToAlert)
            state = "alerting";
        else if (breaches >= 1)
            state = "warning";
        else
            state = "ok";

        var shouldAlert = state == "alerting" && !alreadyAlertedThisStreak;
        return new DriftDecision(breaches, state, shouldAlert);
    }
}
