using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.Ai;

/// <summary>
/// Persists AI Core.ShadowRun records to Postgres via <see cref="IAppDbContext"/>.
/// Scoped (owns a per-request DbContext) — the singleton ModelGateway resolves it
/// inside a fresh DI scope per write. Core types are written as global:: to avoid the
/// namespace clash (Application.* vs TextStack.*) and the type-name clash with the EF
/// entity <see cref="ShadowRun"/>.
/// </summary>
public sealed class DbShadowRunWriter(
    IAppDbContext db,
    ILogger<DbShadowRunWriter> logger) : global::TextStack.Ai.Core.IShadowRunWriter
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

        // Candidate registration: ensure a Shadow ModelRegistration exists for this
        // (feature, shadow provider, shadow model) so an admin has a row to promote. Keyed
        // on the existing (feature_tag, provider_key, model_id) unique index. Best-effort —
        // this runs on the gateway's fire-and-forget shadow path, so a failure here must
        // NOT bubble out of the writer (the shadow_run itself is already persisted).
        try
        {
            if (!string.IsNullOrWhiteSpace(run.ShadowProviderKey)
                && !string.IsNullOrWhiteSpace(run.ShadowModelId))
            {
                var exists = await db.Models.AnyAsync(
                    m => m.FeatureTag == run.FeatureTag
                        && m.ProviderKey == run.ShadowProviderKey
                        && m.ModelId == run.ShadowModelId,
                    ct);
                if (!exists)
                {
                    db.Models.Add(new ModelRegistration
                    {
                        Id = Guid.NewGuid(),
                        FeatureTag = run.FeatureTag,
                        ProviderKey = run.ShadowProviderKey,
                        ModelId = run.ShadowModelId,
                        Status = ModelStatus.Shadow,
                        CreatedAt = DateTimeOffset.UtcNow,
                    });
                    await db.SaveChangesAsync(ct);
                }
            }
        }
        catch (Exception ex)
        {
            // A concurrent shadow write may lose the unique-index race; swallow + log.
            logger.LogDebug(ex, "Shadow candidate upsert skipped for feature '{Feature}'", run.FeatureTag);
        }
    }
}
