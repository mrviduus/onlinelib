namespace TextStack.Ai.Evals;

/// <summary>
/// One golden case paired with the model output the <see cref="GoldenRunner"/>
/// produced for it. <typeparamref name="TCase"/> is the feature's golden record
/// so the runner stays feature-agnostic.
/// </summary>
public record GoldenResult<TCase>(TCase Case, string Actual);

/// <summary>
/// Three scoring axes for a feature's LLM-as-judge. Each string is a short
/// description shown to the judge (e.g. "accuracy: matches the meaning in context").
/// Per-feature rubrics let one judge runner score Explain, Translate, distractors,
/// etc. without a fixed dimension set.
/// </summary>
public record Rubric(string Dim1, string Dim2, string Dim3);

/// <summary>
/// A single judge verdict: 1–5 on each of the rubric's three dimensions. A failed
/// or unparseable judge call yields all-zero scores (with the reason in
/// <see cref="Rationale"/>) so it drags the mean down instead of crashing the run.
/// </summary>
public record JudgeScore(int D1, int D2, int D3, string Rationale)
{
    /// <summary>Mean of the three dimensions (0–5).</summary>
    public double Mean => (D1 + D2 + D3) / 3.0;
}

/// <summary>Aggregate of one eval run — the numbers a gate or dashboard reads.</summary>
public record EvalSummary(int N, double Mean1, double Mean2, double Mean3, double MeanOverall);
