namespace TextStack.Ai.Core;

/// <summary>Generic agent contract. Implementations own an <see cref="ILlmService"/>, a tool subset, and an iteration cap.</summary>
public interface IAgent<TInput, TOutput>
{
    /// <summary>Executes the agent loop until termination, budget exhaustion, or cancellation.</summary>
    Task<AgentResult<TOutput>> RunAsync(TInput input, AgentContext ctx, CancellationToken ct);
}
