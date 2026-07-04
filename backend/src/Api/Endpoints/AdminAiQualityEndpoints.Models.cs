using Api.Middleware;
using Contracts.Admin;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class AdminAiQualityEndpoints
{
    // Phase 12 (RLOps): the whole models registry (tiny table). Project to memory first,
    // then Status.ToString() — the stored-string enum has no in-query .ToString() translation.
    private static async Task<IResult> GetModels(AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Models
            .OrderBy(m => m.FeatureTag).ThenBy(m => m.Status)
            .Select(m => new { m.Id, m.FeatureTag, m.ProviderKey, m.ModelId, m.Status, m.CreatedAt })
            .ToListAsync(ct);

        var models = rows.Select(m => new ModelRegistrationDto(
            m.Id, m.FeatureTag, m.ProviderKey, m.ModelId, m.Status.ToString(), m.CreatedAt)).ToList();

        return Results.Ok(new ModelsRegistryDto(models));
    }

    // Phase 12 (RLOps): make a Shadow registration the new Primary for its feature, demoting
    // the current Primary to Shadow + writing an audit row, in one transaction. Service throws
    // DomainException (→400 for not-found/Retired/already-Primary) or ConflictException (→409 for
    // a concurrent promote), both mapped by the ExceptionMiddleware. AdminUserId is audited.
    private static async Task<IResult> PromoteModel(
        Guid id,
        HttpContext httpContext,
        Application.Ai.ModelPromotionService service,
        CancellationToken ct)
    {
        var adminId = httpContext.GetAdminUserId();
        var result = await service.PromoteAsync(id, adminId, ct);
        return Results.Ok(ToDto(result));
    }

    // Phase 12 (RLOps): revert the most recent promotion for a feature (the demoted model becomes
    // Primary again). 409 (ConflictException) if there's no prior promotion to roll back.
    private static async Task<IResult> RollbackModel(
        string feature,
        HttpContext httpContext,
        Application.Ai.ModelPromotionService service,
        CancellationToken ct)
    {
        var adminId = httpContext.GetAdminUserId();
        var result = await service.RollbackAsync(feature, adminId, ct);
        return Results.Ok(ToDto(result));
    }

    private static ModelPromotionResultDto ToDto(Application.Ai.ModelPromotionResult r) =>
        new(
            r.FeatureTag,
            new ModelRegistrationDto(
                r.NewPrimary.Id, r.NewPrimary.FeatureTag, r.NewPrimary.ProviderKey,
                r.NewPrimary.ModelId, r.NewPrimary.Status.ToString(), r.NewPrimary.CreatedAt),
            r.DemotedToShadow is null ? null : new ModelRegistrationDto(
                r.DemotedToShadow.Id, r.DemotedToShadow.FeatureTag, r.DemotedToShadow.ProviderKey,
                r.DemotedToShadow.ModelId, r.DemotedToShadow.Status.ToString(), r.DemotedToShadow.CreatedAt),
            r.Action.ToString(),
            r.AdminUserId,
            r.CreatedAt);
}
