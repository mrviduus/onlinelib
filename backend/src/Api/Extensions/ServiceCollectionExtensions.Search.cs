using Application.Search;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using TextStack.Search;
using TextStack.Search.Meilisearch;

namespace Api.Extensions;

public static partial class ServiceCollectionExtensions
{
    /// <summary>
    /// Search stack: the TextStack.Search library, the configured provider
    /// (Postgres FTS default / Meilisearch), the CLI reindex service, and the
    /// embedding-backed similar-books + hybrid-catalog services.
    /// </summary>
    public static IServiceCollection AddTextStackSearchStack(
        this IServiceCollection services, string connectionString, IConfiguration configuration)
    {
        // Search library
        services.AddTextStackSearch();
        var searchProvider = configuration["Search:Provider"] ?? "postgres";
        if (searchProvider == "meilisearch")
            services.AddMeilisearchProvider(options =>
                configuration.GetSection("Search:Meilisearch").Bind(options));
        else
            services.AddPostgresFtsProvider(
                _ => () => new NpgsqlConnection(connectionString),
                options => options.ConnectionString = connectionString);

        // Similar books (AI-055): cosine NN over editions.embedding. Same raw Func<IDbConnection>
        // factory as RAG — a raw connection casts the vector server-side (no pgvector type registration).
        services.AddScoped(_ =>
            new Application.Recommendations.SimilarBooksService(() => new NpgsqlConnection(connectionString)));

        // Hybrid catalog search (AI-057): blends the FTS edition ranking with cosine NN over
        // editions.embedding via RRF. Only invoked on `semantic=true`; the pure-FTS path never touches it.
        services.AddScoped(sp =>
            new HybridCatalogSearch(
                sp.GetRequiredService<TextStack.Search.Abstractions.ISearchProvider>(),
                // Lazy: OpenAiEmbeddingClient throws in its ctor on a keyless host. Resolved only when
                // semantic search actually runs (inside HybridCatalogSearch's try/catch), so non-semantic
                // /search never constructs it and a keyless stack degrades to FTS instead of 500ing.
                () => sp.GetRequiredService<global::TextStack.Ai.Core.IEmbeddingService>(),
                () => new NpgsqlConnection(connectionString),
                sp.GetRequiredService<ILogger<HybridCatalogSearch>>()));

        // Reindex service (used by CLI)
        services.AddScoped<SearchReindexService>();

        return services;
    }
}
