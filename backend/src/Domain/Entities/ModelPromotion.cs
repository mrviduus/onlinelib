using Domain.Enums;

namespace Domain.Entities;

/// <summary>
/// Append-only audit of a primary-routing change for one feature (table
/// <c>model_promotions</c>, Phase 12 RLOps). Each row records the swap an admin made:
/// the outgoing Primary (<c>From*</c>, null on the very first promotion for a feature)
/// and the incoming one (<c>To*</c>), with provider/model denormalized so the history
/// reads even after the <c>models</c> rows change. Rollback reads the latest row for a
/// feature and re-applies the inverse swap, writing a new row with
/// <see cref="PromotionAction.Rollback"/>. Never updated or deleted — it's the audit
/// trail the rollback path replays. Plain POCO; EF mapping lives in AppDbContext.Ai.cs.
/// </summary>
public class ModelPromotion
{
    public Guid Id { get; set; }
    public required string FeatureTag { get; set; }

    /// <summary>The outgoing Primary that was demoted to Shadow; null on the first
    /// promotion for a feature (no prior Primary registration).</summary>
    public Guid? FromModelRegistrationId { get; set; }

    /// <summary>The incoming model that became Primary.</summary>
    public required Guid ToModelRegistrationId { get; set; }

    public string? FromProviderKey { get; set; }
    public string? FromModelId { get; set; }
    public required string ToProviderKey { get; set; }
    public required string ToModelId { get; set; }

    public PromotionAction Action { get; set; }

    /// <summary>The admin who triggered the change (null when unattributed).</summary>
    public Guid? AdminUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
