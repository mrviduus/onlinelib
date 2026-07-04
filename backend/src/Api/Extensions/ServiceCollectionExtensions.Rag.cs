using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using TextStack.Ai.Rag;

namespace Api.Extensions;

public static partial class ServiceCollectionExtensions
{
    /// <summary>
    /// RAG stack: vector retrieval, on-demand chunking, and the spoiler-safe
    /// context + "Ask this book" orchestration services (public + user-book).
    /// </summary>
    public static IServiceCollection AddTextStackRag(this IServiceCollection services, string connectionString)
    {
        // RAG vector retrieval (Phase 4). Raw Npgsql like the search provider; query embedded via
        // IEmbeddingService (registered in AddApplication). Used by the admin debug endpoint (AI-022).
        services.AddRagRetrieval(_ => () => new NpgsqlConnection(connectionString));
        // On-demand "Ask this book" index trigger (Phase 1): the chunker + shared chunking service.
        services.AddAiRag();
        services.AddScoped<Infrastructure.Rag.BookChunkingService>();
        // Spoiler-safe context builder (AI-024): resolves lastRead + gates chunks + private corpus.
        services.AddScoped<Application.Rag.RagContextService>();
        // "Ask this book" orchestration (AI-025): context + LLM gateway → grounded answer with citations.
        services.AddScoped<Application.Rag.RagAskService>();
        services.AddScoped<Application.Rag.IRagAskService>(sp => sp.GetRequiredService<Application.Rag.RagAskService>());
        // Phase 2 "Ask this book" for user uploads: per-user isolated retrieval context (no spoiler gate).
        services.AddScoped<Application.Rag.UserBookRagContextService>();

        return services;
    }
}
