namespace TextStack.Ai.Core;

/// <summary>
/// Record-shape for a single LLM call's persisted trace row. The EF entity + mapping land in AI-003;
/// this record is the shape passed to <see cref="ILlmTraceWriter.WriteAsync"/> and used by callers
/// composing traces in-memory before write.
/// </summary>
public record LlmTrace(
    Guid Id,
    string FeatureTag,
    string ModelId,
    string PromptHash,
    string? SystemPrompt,
    string MessagesJson,
    string? ResponseText,
    string? ToolCallsJson,
    int TokensIn,
    int TokensOut,
    decimal CostUsd,
    int LatencyMs,
    Guid? UserId,
    Guid? TraceParentId,
    string? Error,
    DateTimeOffset CreatedAt);
