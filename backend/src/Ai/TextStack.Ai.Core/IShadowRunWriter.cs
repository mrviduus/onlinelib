namespace TextStack.Ai.Core;

/// <summary>Persists a single shadow-run row. Implemented in Application/Infrastructure (EF).</summary>
public interface IShadowRunWriter
{
    /// <summary>Persists one shadow comparison row.</summary>
    Task WriteAsync(ShadowRun run, CancellationToken ct);
}

/// <summary>
/// Record-shape for a single primary-vs-shadow comparison, passed to
/// <see cref="IShadowRunWriter.WriteAsync"/>. Responses are already redacted by the
/// gateway before this record is constructed (mirrors <see cref="LlmTrace"/> /
/// <see cref="ILlmTraceWriter"/>). The EF entity + mapping live in Infrastructure.
/// </summary>
public record ShadowRun(
    Guid Id,
    string FeatureTag,
    string PrimaryModelId,
    string ShadowModelId,
    string? PrimaryResponse,
    string? ShadowResponse,
    int PrimaryLatencyMs,
    int ShadowLatencyMs,
    decimal PrimaryCostUsd,
    decimal ShadowCostUsd,
    int PrimaryTokensIn,
    int PrimaryTokensOut,
    int ShadowTokensIn,
    int ShadowTokensOut,
    Guid? PrimaryTraceId,
    Guid? ShadowTraceId,
    string PromptHash,
    Guid? UserId,
    DateTimeOffset CreatedAt);
