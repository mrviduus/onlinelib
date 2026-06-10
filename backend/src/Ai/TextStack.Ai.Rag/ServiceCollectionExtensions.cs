using Microsoft.Extensions.DependencyInjection;

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
}
