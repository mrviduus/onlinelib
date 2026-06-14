using TextStack.Ai.Core;

namespace TextStack.Ai.Agents;

/// <summary>
/// Builds an <see cref="AgentRunRecord"/> from a run's outcome (AI-036), so the endpoint (AI-037) can
/// persist completed, budget-exhausted and errored runs uniformly. Pure — unit-tested directly.
/// </summary>
public static class AgentRunRecordFactory
{
    public const string StatusCompleted = "completed";
    public const string StatusBudgetExhausted = "budget_exhausted";
    public const string StatusError = "error";

    private static readonly AgentUsage NoUsage = new(0, 0, 0, 0m, 0);

    /// <summary>A run that produced a final answer.</summary>
    public static AgentRunRecord Completed(
        Guid id, string agent, Guid? userId, Guid? editionId, string goal, AgentResult<string> result) =>
        new(id, agent, userId, editionId, goal, StatusCompleted,
            result.Output, result.Steps, result.Usage, Error: null, DateTimeOffset.UtcNow);

    /// <summary>A run that hit its iteration / cost cap — keeps the partial transcript the exception carries.</summary>
    public static AgentRunRecord BudgetExhausted(
        Guid id, string agent, Guid? userId, Guid? editionId, string goal, AgentBudgetExhaustedException ex) =>
        new(id, agent, userId, editionId, goal, StatusBudgetExhausted,
            Output: null, ex.Steps, ex.Usage, ex.Message, DateTimeOffset.UtcNow);

    /// <summary>A run that failed for any other reason (no transcript available).</summary>
    public static AgentRunRecord Failed(
        Guid id, string agent, Guid? userId, Guid? editionId, string goal, Exception ex) =>
        new(id, agent, userId, editionId, goal, StatusError,
            Output: null, Steps: [], NoUsage, ex.Message, DateTimeOffset.UtcNow);
}
