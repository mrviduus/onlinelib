using System.Data;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace TextStack.Ai.Rag;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the RAG chunker. <see cref="IChunker"/> is a singleton — the tiktoken
    /// vocab is loaded once at construction and reused across ingestion jobs.
    /// </summary>
    public static IServiceCollection AddAiRag(this IServiceCollection services)
    {
        services.AddSingleton<IChunker, Chunker>();
        return services;
    }

    /// <summary>
    /// Registers vector retrieval (<see cref="IRagService"/>). The caller supplies a connection
    /// factory (mirrors the search provider) — retrieval runs raw SQL, not EF. Requires
    /// <see cref="IEmbeddingService"/> to be registered (query embedding).
    /// </summary>
    public static IServiceCollection AddRagRetrieval(
        this IServiceCollection services,
        Func<IServiceProvider, Func<IDbConnection>> connectionFactory)
    {
        services.AddSingleton<IRagService>(sp =>
            new RagService(connectionFactory(sp), sp.GetRequiredService<IEmbeddingService>()));
        return services;
    }
}
