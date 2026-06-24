namespace Domain.Entities;

/// <summary>
/// Server-held state for one Learning-Tutor (AI-Agent-2) micro-session, persisted between HTTP turns
/// (table <c>tutor_session</c>). The tutor PLANS what to study next over the learner's real SRS + reading
/// state and hands off to the existing vocabulary-review flow; this row carries the plan across the HITL
/// boundary so <c>POST /me/tutor/session/{id}/feedback</c> can re-plan the remainder after the learner
/// answers. <see cref="PlanJson"/> is the current ordered study set as jsonb (read whole, not queried per
/// field). Plain POCO; EF mapping in AppDbContext.Agents.cs.
/// </summary>
public class TutorSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    /// <summary>The current plan as a JSON object: { plan:[{wordId, word, exerciseType, difficulty, why}], rationale }.</summary>
    public required string PlanJson { get; set; }

    /// <summary>Lifecycle: "active" (more turns expected) | "completed" (learner finished or session ended).</summary>
    public string Status { get; set; } = StatusActive;

    /// <summary>How many planning turns have run (1 = initial plan; incremented per feedback re-plan).</summary>
    public int TurnCount { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // Navigation
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;

    public const string StatusActive = "active";
    public const string StatusCompleted = "completed";
}
