namespace Domain.Entities;

/// <summary>
/// One shadow comparison row (table <c>shadow_runs</c>): a primary call and a
/// fire-and-forget shadow call for the same request, side by side. Written by the
/// ModelGateway when a feature has a shadow route configured + the call is sampled.
/// Responses are redacted (PII-scrubbed) before persistence, mirroring llm_traces.
/// Plain POCO; EF mapping lives in AppDbContext.Ai.cs.
/// </summary>
public class ShadowRun
{
    public Guid Id { get; set; }
    public required string FeatureTag { get; set; }
    public required string PrimaryModelId { get; set; }
    public required string ShadowModelId { get; set; }
    public string? PrimaryResponse { get; set; }
    public string? ShadowResponse { get; set; }
    public int PrimaryLatencyMs { get; set; }
    public int ShadowLatencyMs { get; set; }
    public decimal PrimaryCostUsd { get; set; }
    public decimal ShadowCostUsd { get; set; }
    public int PrimaryTokensIn { get; set; }
    public int PrimaryTokensOut { get; set; }
    public int ShadowTokensIn { get; set; }
    public int ShadowTokensOut { get; set; }
    public Guid? PrimaryTraceId { get; set; }
    public Guid? ShadowTraceId { get; set; }
    public required string PromptHash { get; set; }
    public Guid? UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    // Optional FK → users; ON DELETE SET NULL (a deleted user shouldn't erase runs).
    public User? User { get; set; }
}
