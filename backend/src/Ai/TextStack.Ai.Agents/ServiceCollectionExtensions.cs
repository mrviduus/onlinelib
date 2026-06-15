using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace TextStack.Ai.Agents;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the generic <see cref="AgentLoop"/> engine (Phase 6). Singleton — it is stateless;
    /// per-run state (messages, steps, usage) lives on the stack of <see cref="AgentLoop.RunAsync"/>,
    /// and scoped tool services arrive via <c>AgentContext.Services</c>. Requires the tool registry +
    /// dispatcher (<c>AddAiTools</c>) and an <c>ILlmService</c> to be registered.
    /// </summary>
    public static IServiceCollection AddAiAgents(this IServiceCollection services)
    {
        services.TryAddSingleton<AgentLoop>();
        // CrewOrchestrator (AI-040): stateless engine for multi-agent crews; per-run state lives on the
        // stack, per-task DI scopes arrive via AgentContext.Services.
        services.TryAddSingleton<CrewOrchestrator>();
        return services;
    }
}
