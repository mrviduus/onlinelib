namespace Contracts.Agents;

/// <summary>Request to start (or resume) a Tutor session (AI-Agent-2). <see cref="MaxItems"/> is optional (server-capped).</summary>
public record TutorStartRequest(int? MaxItems);

/// <summary>One learner result fed back to the tutor for re-planning: the card answered + correctness + latency.</summary>
public record TutorFeedbackResultDto(Guid WordId, bool Correct, int ResponseTimeMs);

/// <summary>Request to submit the learner's results for the current session and get the re-planned remainder.</summary>
public record TutorFeedbackRequest(IReadOnlyList<TutorFeedbackResultDto> Results);

/// <summary>
/// One planned study item in the Tutor response. <see cref="WordId"/> + <see cref="Word"/> reference a REAL
/// vocab card (re-projected from a tool result — never invented). <see cref="ExerciseType"/> is calibrated to
/// the card's SRS <see cref="Stage"/> (recognition / recall / context), <see cref="Difficulty"/> to stage +
/// accuracy, and <see cref="Why"/> is the per-item reasoning. The client hands these off to the existing
/// vocabulary-review flow.
/// </summary>
public record TutorPlanItemDto(
    Guid WordId,
    string Word,
    int Stage,
    string ExerciseType,
    string Difficulty,
    string Why);

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
