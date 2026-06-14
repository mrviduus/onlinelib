namespace Domain.Entities;

/// <summary>
/// Persisted record of one agent run (table <c>agent_run</c>, Phase 6 / AI-036). Written after a
/// Study Buddy (or future) agent finishes so the reader UI can replay its steps and so runs are
/// observable (cost / iterations / status). <see cref="StepsJson"/> holds the full transcript as
/// jsonb — read whole for "show steps", not queried per field. Plain POCO; EF mapping in
/// AppDbContext.Agents.cs.
/// </summary>
public class AgentRun
{
    public Guid Id { get; set; }

    /// <summary>Which agent ran, e.g. "studybuddy".</summary>
    public required string Agent { get; set; }

    public Guid? UserId { get; set; }
    public Guid? EditionId { get; set; }

    /// <summary>The user goal the agent was given (the highlighted passage).</summary>
    public required string Goal { get; set; }

    /// <summary>Terminal status: "completed" | "budget_exhausted" | "error".</summary>
    public required string Status { get; set; }

    /// <summary>Final answer, when the run completed.</summary>
    public string? Output { get; set; }

    /// <summary>Full step transcript as a JSON array (jsonb).</summary>
    public required string StepsJson { get; set; }

    public int Iterations { get; set; }
    public int TokensIn { get; set; }
    public int TokensOut { get; set; }
    public decimal CostUsd { get; set; }
    public int LatencyMs { get; set; }

    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    // Optional FK → users; ON DELETE SET NULL (a deleted user shouldn't erase the run history).
    public User? User { get; set; }
}
