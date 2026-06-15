using System.Text.Json;
using TextStack.Ai.Core;

namespace TextStack.Ai.Agents;

/// <summary>
/// Maps a finished <see cref="CrewResult{TState}"/> onto the existing Phase 6 <see cref="AgentRunRecord"/>
/// (AI-040) so a crew run persists through the SAME <c>IAgentRunWriter</c>/<c>agent_run</c> path as a
/// single agent — no new table, no new writer. The crew is recorded as agent <c>crew.{name}</c>; each
/// sub-agent invocation becomes ONE <see cref="AgentStep"/> of kind <c>sub_agent</c>, with the sub-agent's
/// own transcript nested under <c>payload.steps</c> for full replay. Pure — unit-tested directly.
/// </summary>
public static class CrewRunRecordFactory
{
    public const string StatusCompleted = "completed";
    public const string StatusBudgetExhausted = "budget_exhausted";
    public const string StatusError = "error";

    public const string SubAgentStepKind = "sub_agent";

    /// <summary>
    /// Builds the persistable record. <paramref name="output"/> is a caller-supplied summary string — the
    /// factory does not stringify <c>TState</c>. The record's <c>Status</c>/<c>Error</c>/<c>Usage</c> come
    /// straight from <paramref name="result"/>.
    /// </summary>
    public static AgentRunRecord From<TState>(
        Guid id,
        string crewName,
        Guid? userId,
        Guid? editionId,
        string goal,
        string? output,
        CrewResult<TState> result)
    {
        var steps = result.Steps.Select(ToStep).ToList();

        return new AgentRunRecord(
            id,
            $"crew.{crewName}",
            userId,
            editionId,
            goal,
            result.Status,
            output,
            steps,
            result.Usage,
            result.Error,
            DateTimeOffset.UtcNow);
    }

    /// <summary>One crew step → one "sub_agent" AgentStep; the sub-agent transcript is nested in payload.steps.</summary>
    private static AgentStep ToStep(CrewStepEntry entry) =>
        new(
            entry.Index,
            SubAgentStepKind,
            JsonSerializer.SerializeToElement(new
            {
                stage = entry.Stage,
                agentName = entry.AgentName,
                status = entry.Status,
                usage = entry.Usage,
                error = entry.Error,
                steps = entry.Steps,
            }),
            DateTimeOffset.UtcNow);
}
