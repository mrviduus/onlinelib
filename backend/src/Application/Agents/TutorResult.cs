using System.Text.Json;
using System.Text.Json.Serialization;

namespace Application.Agents;

/// <summary>
/// One learner-result fed back to the tutor after the HITL boundary (AI-Agent-2): the card the learner
/// just answered, whether they got it right, and how long it took. The agent re-plans the remainder of the
/// session from these. <see cref="WordId"/> must reference a card that was in the prior plan.
/// </summary>
public record TutorFeedbackItem(Guid WordId, bool Correct, int ResponseTimeMs);

/// <summary>
/// What the Tutor agent was asked to plan over (AI-Agent-2). <see cref="MaxItems"/> bounds the session size
/// (thesis guardrail — this enhances reading, it is not an endless drill). <see cref="Feedback"/> is empty
/// on the initial plan and carries the learner's results on a re-plan turn.
/// </summary>
public record TutorInput(int MaxItems, IReadOnlyList<TutorFeedbackItem> Feedback)
{
    public TutorInput(int maxItems) : this(maxItems, []) { }
}

/// <summary>
/// One planned study item. <see cref="WordId"/> + <see cref="Word"/> are RE-PROJECTED from a real vocab card
/// returned by a tool during the run (anti-hallucination — the model can never invent a card id or rename a
/// word). <see cref="ExerciseType"/> is calibrated to the card's SRS stage (recognition / recall / context),
/// <see cref="Difficulty"/> to stage + accuracy, and <see cref="Why"/> is the per-item reasoning.
/// </summary>
public record TutorPlanItem(
    Guid WordId,
    string Word,
    int Stage,
    string ExerciseType,
    string Difficulty,
    string Why)
{
    public const string ExerciseRecognition = "recognition";
    public const string ExerciseRecall = "recall";
    public const string ExerciseContext = "context";

    public const string DifficultyEasy = "easy";
    public const string DifficultyMedium = "medium";
    public const string DifficultyHard = "hard";
}

/// <summary>
/// The Tutor agent's structured plan: an ordered <see cref="Items"/> study set (each card grounded in a
/// tool result), an overall <see cref="Rationale"/>, and a closing <see cref="ReadingNudge"/> that keeps the
/// learner pointed back at reading (the product thesis). Maps directly to the endpoint response DTO and is
/// the <c>PlanJson</c> persisted on the <c>TutorSession</c>.
/// </summary>
public record TutorPlan(
    IReadOnlyList<TutorPlanItem> Items,
    string Rationale,
    string ReadingNudge)
{
    public static TutorPlan Empty(string rationale) =>
        new([], rationale, "Keep reading — you have no cards due right now.");

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    /// <summary>Serializes the plan to the jsonb shape persisted on <c>TutorSession.PlanJson</c>.</summary>
    public string ToPlanJson() => JsonSerializer.Serialize(this, JsonOpts);
}

/// <summary>
/// The JSON contract the agent's final message must emit (parsed by <see cref="TutorAgent.Parse"/>).
/// Lenient: missing/unknown fields collapse to null; any item whose <see cref="TutorItemJson.WordId"/>
/// wasn't returned by a tool is DROPPED (never invented).
/// </summary>
public record TutorPlanJson(
    [property: JsonPropertyName("plan")] List<TutorItemJson>? Plan,
    [property: JsonPropertyName("rationale")] string? Rationale,
    [property: JsonPropertyName("readingNudge")] string? ReadingNudge);

/// <summary>One planned item inside the agent's final JSON.</summary>
public record TutorItemJson(
    [property: JsonPropertyName("wordId")] string? WordId,
    [property: JsonPropertyName("exerciseType")] string? ExerciseType,
    [property: JsonPropertyName("difficulty")] string? Difficulty,
    [property: JsonPropertyName("why")] string? Why);
