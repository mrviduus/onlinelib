namespace TextStack.Ai.Evals;

/// <summary>
/// One golden case paired with the model output the <see cref="GoldenRunner"/>
/// produced for it. <typeparamref name="TCase"/> is the feature's golden record
/// (e.g. an Explain golden) so the runner stays feature-agnostic.
/// </summary>
public record GoldenResult<TCase>(TCase Case, string Actual);

/// <summary>
/// A single LLM-as-judge verdict on one (expected, actual) pair. Dimensions are
/// 1–5 per the playbook rubric. A failed/unparseable judge call yields all-zero
/// scores with the reason in <see cref="Rationale"/> — those drag the mean down
/// rather than crashing the run.
/// </summary>
public record JudgeScore(int Accuracy, int Conciseness, int Usefulness, string Rationale)
{
    /// <summary>Mean of the three dimensions (0–5).</summary>
    public double Mean => (Accuracy + Conciseness + Usefulness) / 3.0;
}

/// <summary>Aggregate of a whole eval run — the numbers a gate or dashboard reads.</summary>
public record EvalSummary(
    int N,
    double MeanAccuracy,
    double MeanConciseness,
    double MeanUsefulness,
    double MeanOverall);
