using Application.Common.Interfaces;
using Domain.Entities;

namespace Application.Ai;

/// <summary>
/// Persists AI Core.ShadowRun records to Postgres via <see cref="IAppDbContext"/>.
/// Scoped (owns a per-request DbContext) — the singleton ModelGateway resolves it
/// inside a fresh DI scope per write. Core types are written as global:: to avoid the
/// namespace clash (Application.* vs TextStack.*) and the type-name clash with the EF
/// entity <see cref="ShadowRun"/>.
/// </summary>
public sealed class DbShadowRunWriter(IAppDbContext db) : global::TextStack.Ai.Core.IShadowRunWriter
{
    public async Task WriteAsync(global::TextStack.Ai.Core.ShadowRun run, CancellationToken ct)
    {
        db.ShadowRuns.Add(new ShadowRun
        {
            Id = run.Id,
            FeatureTag = run.FeatureTag,
            PrimaryModelId = run.PrimaryModelId,
            ShadowModelId = run.ShadowModelId,
            PrimaryResponse = run.PrimaryResponse,
            ShadowResponse = run.ShadowResponse,
            PrimaryLatencyMs = run.PrimaryLatencyMs,
            ShadowLatencyMs = run.ShadowLatencyMs,
            PrimaryCostUsd = run.PrimaryCostUsd,
            ShadowCostUsd = run.ShadowCostUsd,
            PrimaryTokensIn = run.PrimaryTokensIn,
            PrimaryTokensOut = run.PrimaryTokensOut,
            ShadowTokensIn = run.ShadowTokensIn,
            ShadowTokensOut = run.ShadowTokensOut,
            PrimaryTraceId = run.PrimaryTraceId,
            ShadowTraceId = run.ShadowTraceId,
            PromptHash = run.PromptHash,
            UserId = run.UserId,
            CreatedAt = run.CreatedAt,
        });
        await db.SaveChangesAsync(ct);
    }
}
