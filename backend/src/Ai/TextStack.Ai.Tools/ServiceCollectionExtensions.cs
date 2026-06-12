using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TextStack.Ai.Core;

namespace TextStack.Ai.Tools;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Scans <paramref name="assemblies"/> for concrete <see cref="ITool"/> implementations and registers
    /// each as a singleton <see cref="ITool"/>, plus the <see cref="IToolRegistry"/> over them. Tools are
    /// singletons because they're stateless — per-request state (user, edition, scoped services) arrives
    /// via <see cref="ToolContext"/> at invoke time, so there's no captive-dependency risk in the
    /// singleton registry. Idempotent: <see cref="ServiceCollectionDescriptorExtensions.TryAddEnumerable"/>
    /// de-dups by implementation type, so calling this twice (or across overlapping assemblies) is safe.
    /// </summary>
    public static IServiceCollection AddAiTools(this IServiceCollection services, params Assembly[] assemblies)
    {
        foreach (var assembly in assemblies)
        {
            foreach (var type in assembly.GetTypes().Where(IsConcreteTool))
                services.TryAddEnumerable(ServiceDescriptor.Singleton(typeof(ITool), type));
        }

        services.TryAddSingleton<IToolRegistry, ToolRegistry>();
        services.TryAddSingleton<ToolDispatcher>();
        services.TryAddSingleton<ToolCallingSession>();
        return services;
    }

    private static bool IsConcreteTool(Type type) =>
        type is { IsAbstract: false, IsInterface: false, IsGenericTypeDefinition: false }
        && typeof(ITool).IsAssignableFrom(type);
}
