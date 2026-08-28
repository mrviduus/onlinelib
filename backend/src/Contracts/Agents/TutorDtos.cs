namespace Contracts.Agents;

/// <summary>Request to start (or resume) a Tutor session (AI-Agent-2). <see cref="MaxItems"/> is optional (server-capped).</summary>
public record TutorStartRequest(int? MaxItems);

/// <summary>One learner result fed back to the tutor for re-planning: the card answered + correctness + latency.</summary>
public record TutorFeedbackResultDto(Guid WordId, bool Correct, int ResponseTimeMs);

/// <summary>Request to submit the learner's results for the current session and get the re-planned remainder.</summary>
public record TutorFeedbackRequest(IReadOnlyList<TutorFeedbackResultDto> Results);

/// <summary>
/// One answer, recorded the moment it is given. Separate from
/// <see cref="TutorFeedbackRequest"/> because that one re-plans the session — several LLM calls —
/// and an answer must not have to wait for planning to be worth anything.
/// </summary>
public record TutorAnswerRequest(Guid WordId, bool Correct, int ResponseTimeMs);

/// <summary>
/// One planned study item in the Tutor response. <see cref="WordId"/> + <see cref="Word"/> reference a REAL
/// vocab card (re-projected from a tool result — never invented). <see cref="ExerciseType"/> is calibrated to
/// the card's SRS <see cref="Stage"/> (recognition / recall / context), <see cref="Difficulty"/> to stage +
/// accuracy, and <see cref="Why"/> is the per-item reasoning.
/// <para>
/// The render fields (<see cref="Translation"/>, <see cref="Definition"/>, <see cref="Sentence"/>,
/// <see cref="BookTitle"/>, <see cref="Hint"/>, <see cref="Distractors"/>) are enriched server-side from the
/// caller's REAL <c>VocabularyWord</c> row (keyed on the already-validated <see cref="WordId"/>) so the client
/// can build the same card the vocabulary-review flow renders without a fragile re-fetch+join. An item whose
/// id no longer maps to one of the caller's cards is dropped, not emitted with null render fields.
/// </para>
/// </summary>
public record TutorPlanItemDto(
    Guid WordId,
    string Word,
    int Stage,
    string ExerciseType,
    string Difficulty,
    string Why,
    string? Translation,
    string? Definition,
    string? Sentence,
    string? BookTitle,
    string? Hint,
    IReadOnlyList<string> Distractors);

/// <summary>
/// The Tutor agent's response: the persisted <see cref="SessionId"/> (carry it to the feedback endpoint), the
/// ordered <see cref="Plan"/>, the overall <see cref="Rationale"/>, a closing <see cref="ReadingNudge"/> (the
/// thesis), and the per-turn <see cref="RunId"/> for replay in the admin AI-quality UI.
/// </summary>
public record TutorSessionResponse(
    Guid SessionId,
    IReadOnlyList<TutorPlanItemDto> Plan,
    string Rationale,
    string ReadingNudge,
    Guid RunId);
