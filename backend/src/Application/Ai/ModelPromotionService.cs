using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace Application.Ai;

/// <summary>
/// One-click promote / rollback of the PRIMARY model for a feature (Phase 12 RLOps).
/// Mutates the <c>models</c> registry — the source of truth the gateway routes by via
/// <see cref="global::TextStack.Ai.Core.IModelRouteProvider"/> — and writes an
/// append-only <see cref="ModelPromotion"/> audit row, all in one transaction. After a
/// successful commit it <see cref="global::TextStack.Ai.Core.IModelRouteProvider.Invalidate">invalidates</see>
/// the route cache so traffic flips on the next call.
///
/// Invariants: exactly one Primary per feature (a partial unique index enforces it; a
/// concurrent promote surfaces as a <see cref="ConflictException"/>); transitions are
/// strictly Shadow→Primary (a Retired model is never promotable); rollback replays the
/// inverse of the latest promotion for the feature, at any age.
/// </summary>
public sealed class ModelPromotionService(
    IAppDbContext db,
    global::TextStack.Ai.Core.IModelRouteProvider routeProvider)
{
    /// <summary>Make the given Shadow registration the Primary for its feature, demoting
    /// the current Primary (if any) to Shadow. Rejects not-found / Retired / already-Primary
    /// (<see cref="DomainException"/> → 400) and a concurrent promote (<see cref="ConflictException"/> → 409).</summary>
    public async Task<ModelPromotionResult> PromoteAsync(Guid modelRegistrationId, Guid? adminUserId, CancellationToken ct)
    {
        await using var tx = await db.BeginTransactionAsync(ct);

        var target = await db.Models.FirstOrDefaultAsync(m => m.Id == modelRegistrationId, ct)
            ?? throw new DomainException("MODEL_NOT_FOUND", $"Model registration '{modelRegistrationId}' not found");

        if (target.Status == ModelStatus.Retired)
            throw new DomainException("MODEL_RETIRED", "A retired model cannot be promoted");
        if (target.Status == ModelStatus.Primary)
            throw new DomainException("ALREADY_PRIMARY", $"Model is already the primary for feature '{target.FeatureTag}'");

        // Current Primary of the SAME feature (the outgoing one). May be none.
        var outgoing = await db.Models.FirstOrDefaultAsync(
            m => m.FeatureTag == target.FeatureTag && m.Status == ModelStatus.Primary, ct);

        if (outgoing is not null)
            outgoing.Status = ModelStatus.Shadow;
        target.Status = ModelStatus.Primary;

        db.ModelPromotions.Add(new ModelPromotion
        {
            Id = Guid.NewGuid(),
            FeatureTag = target.FeatureTag,
            FromModelRegistrationId = outgoing?.Id,
            FromProviderKey = outgoing?.ProviderKey,
            FromModelId = outgoing?.ModelId,
            ToModelRegistrationId = target.Id,
            ToProviderKey = target.ProviderKey,
            ToModelId = target.ModelId,
            Action = PromotionAction.Promote,
            AdminUserId = adminUserId,
            CreatedAt = DateTimeOffset.UtcNow,
        });

        await SaveAndCommitAsync(tx, ct);
        routeProvider.Invalidate();

        return new ModelPromotionResult(target.FeatureTag, target, outgoing, PromotionAction.Promote, adminUserId);
    }

    /// <summary>Revert the most recent promotion for a feature: make the previously
    /// demoted Shadow (the latest row's <c>From</c>) Primary again and demote the current
    /// Primary to Shadow. Rejects when there's no prior promotion or it had no outgoing
    /// model to restore (<see cref="ConflictException"/> → 409). Never rejects by age.</summary>
    public async Task<ModelPromotionResult> RollbackAsync(string featureTag, Guid? adminUserId, CancellationToken ct)
    {
        await using var tx = await db.BeginTransactionAsync(ct);

        var latest = await db.ModelPromotions
            .Where(p => p.FeatureTag == featureTag)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (latest is null)
            throw new ConflictException($"No prior promotion to roll back for feature '{featureTag}'");
        if (latest.FromModelRegistrationId is null)
            throw new ConflictException($"The latest promotion for feature '{featureTag}' had no prior primary to restore");

        // The model to restore (the one demoted by `latest`).
        var restore = await db.Models.FirstOrDefaultAsync(m => m.Id == latest.FromModelRegistrationId.Value, ct)
            ?? throw new ConflictException("The model to roll back to no longer exists");
        if (restore.Status == ModelStatus.Retired)
            throw new ConflictException("The model to roll back to is retired");

        var current = await db.Models.FirstOrDefaultAsync(
            m => m.FeatureTag == featureTag && m.Status == ModelStatus.Primary, ct);

        if (current is not null)
            current.Status = ModelStatus.Shadow;
        restore.Status = ModelStatus.Primary;

        db.ModelPromotions.Add(new ModelPromotion
        {
            Id = Guid.NewGuid(),
            FeatureTag = featureTag,
            FromModelRegistrationId = current?.Id,
            FromProviderKey = current?.ProviderKey,
            FromModelId = current?.ModelId,
            ToModelRegistrationId = restore.Id,
            ToProviderKey = restore.ProviderKey,
            ToModelId = restore.ModelId,
            Action = PromotionAction.Rollback,
            AdminUserId = adminUserId,
            CreatedAt = DateTimeOffset.UtcNow,
        });

        await SaveAndCommitAsync(tx, ct);
        routeProvider.Invalidate();

        return new ModelPromotionResult(featureTag, restore, current, PromotionAction.Rollback, adminUserId);
    }

    // SaveChanges can violate the partial unique index (feature_tag) WHERE status='Primary'
    // under a concurrent promote → surface as a conflict for the endpoint to map to 409.
    private async Task SaveAndCommitAsync(
        Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction tx, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            throw new ConflictException("Concurrent primary change detected; please retry");
        }
    }
}

/// <summary>Outcome of a promote/rollback: the new Primary, the model demoted to Shadow
/// (null if there was none), and the audited action + admin.</summary>
public sealed record ModelPromotionResult(
    string FeatureTag,
    ModelRegistration NewPrimary,
    ModelRegistration? DemotedToShadow,
    PromotionAction Action,
    Guid? AdminUserId)
{
    public DateTimeOffset CreatedAt { get; } = DateTimeOffset.UtcNow;
}
