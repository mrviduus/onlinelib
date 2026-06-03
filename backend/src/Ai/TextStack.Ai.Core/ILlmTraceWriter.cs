namespace TextStack.Ai.Core;

/// <summary>Persists a single LLM trace row. Implemented in Infrastructure (EF) starting in AI-003.</summary>
public interface ILlmTraceWriter
{
    /// <summary>Persists a trace; implementations may sample or drop based on configuration.</summary>
    Task WriteAsync(LlmTrace trace, CancellationToken ct);
}
