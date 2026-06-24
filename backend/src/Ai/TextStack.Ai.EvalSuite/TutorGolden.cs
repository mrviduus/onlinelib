namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One synthetic vocabulary card in a Tutor-eval learner state (AI-Agent-2): a real-shaped card the fake
/// tools return. <see cref="Due"/> marks it as scheduled-now (surfaced by <c>get_due_vocabulary</c>);
/// <see cref="Accuracy"/> + <see cref="Stage"/> drive whether it's "weak" (surfaced by
/// <c>get_weak_vocabulary</c>) and the exercise the plan should calibrate to.
/// </summary>
public record TutorCard(
    string WordId,
    string Word,
    int Stage,
    int ConsecutiveCorrect,
    double Accuracy,
    bool Due,
    bool HasSentence = true);

/// <summary>
/// One Tutor-agent golden (AI-Agent-2): a synthetic learner state (an SRS snapshot + a reading context) plus
/// the structural expectations the produced plan is scored against. There is no single ground-truth plan, so
/// the rubric is structural: <see cref="ExpectedDueWordIds"/> are the genuinely-due cards the plan SHOULD
/// cover; <see cref="ExpectedWeakWordIds"/> are the low-accuracy/early-stage cards it SHOULD prioritize.
/// Difficulty-appropriateness, no-hallucination and thesis-alignment are derived from the cards + the plan
/// (see <c>TutorEvalRunner</c>).
/// </summary>
public record TutorGolden(
    string Name,
    IReadOnlyList<TutorCard> Cards,
    string? ReadingBook,
    string? ReadingLanguage,
    IReadOnlyList<string> ExpectedDueWordIds,
    IReadOnlyList<string> ExpectedWeakWordIds);
