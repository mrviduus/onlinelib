namespace Domain.Entities;

/// <summary>
/// Persisted trace of a single LLM call (table <c>llm_trace</c>). Written —
/// sampled — by the AI <c>TracingDecorator</c> for cost/latency/quality
/// observability. Plain POCO; EF mapping lives in AppDbContext.Ai.cs.
/// </summary>
public class LlmTrace
{
    public Guid Id { get; set; }
    public required string FeatureTag { get; set; }
    public required string ModelId { get; set; }
    public required string PromptHash { get; set; }
    public string? SystemPrompt { get; set; }
    public required string MessagesJson { get; set; }
    public string? ResponseText { get; set; }
    public string? ToolCallsJson { get; set; }
    public int TokensIn { get; set; }
    public int TokensOut { get; set; }
    public decimal CostUsd { get; set; }
    public int LatencyMs { get; set; }
    public Guid? UserId { get; set; }
    public Guid? TraceParentId { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    // Optional FK → users; ON DELETE SET NULL (a deleted user shouldn't erase traces).
    public User? User { get; set; }
}
