using System.Text.Json;
using Application.Common.Interfaces;
using Domain.Entities;

namespace Application.Ai;

/// <summary>
/// Persists agent runs (AI-036) to Postgres via <see cref="IAppDbContext"/>. Scoped (owns a
/// per-request DbContext); the endpoint awaits it after the agent finishes (the run is already done,
/// so there is no latency to hide). The Core <see cref="global::TextStack.Ai.Core.AgentRunRecord"/> is
/// flattened into the EF <see cref="AgentRun"/> entity, with the step transcript serialized to jsonb.
/// Written as global:: to avoid the Application.* vs TextStack.* namespace clash.
/// </summary>
public sealed class DbAgentRunWriter(IAppDbContext db) : global::TextStack.Ai.Core.IAgentRunWriter
{
    public async Task WriteAsync(global::TextStack.Ai.Core.AgentRunRecord run, CancellationToken ct)
    {
        db.AgentRuns.Add(new AgentRun
        {
            Id = run.Id,
            Agent = run.Agent,
            UserId = run.UserId,
            EditionId = run.EditionId,
            Goal = run.Goal,
            Status = run.Status,
            Output = run.Output,
            StepsJson = JsonSerializer.Serialize(run.Steps),
            Iterations = run.Usage.Iterations,
            TokensIn = run.Usage.InputTokensTotal,
            TokensOut = run.Usage.OutputTokensTotal,
            CostUsd = run.Usage.CostUsdTotal,
            LatencyMs = run.Usage.LatencyMs,
            Error = run.Error,
            CreatedAt = run.CreatedAt,
            Confidence = run.Confidence,
            ToolCallsCount = run.ToolCallsCount,
        });
        await db.SaveChangesAsync(ct);
    }
}
