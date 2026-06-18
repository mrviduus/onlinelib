using Domain.Enums;

namespace Domain.Entities;

/// <summary>
/// Registry row mapping a (provider, model) to a feature and its lifecycle
/// <see cref="ModelStatus"/> (table <c>models</c>). The ModelGateway routes primary
/// traffic by config today; this registry is the source of truth for which models
/// are Primary vs Shadow vs Retired per feature, seeded idempotently at startup.
/// Plain POCO; EF mapping lives in AppDbContext.Ai.cs.
/// </summary>
public class ModelRegistration
{
    public Guid Id { get; set; }
    public required string ProviderKey { get; set; }
    public required string ModelId { get; set; }
    public required string FeatureTag { get; set; }
    public ModelStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
