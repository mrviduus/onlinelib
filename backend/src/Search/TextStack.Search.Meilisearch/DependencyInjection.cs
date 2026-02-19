using Meilisearch;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TextStack.Search.Abstractions;

namespace TextStack.Search.Meilisearch;

public static class DependencyInjection
{
    public static IServiceCollection AddMeilisearchProvider(
        this IServiceCollection services,
        Action<MeilisearchOptions> configureOptions)
    {
        services.Configure(configureOptions);

        services.AddSingleton(sp =>
        {
            var opts = sp.GetRequiredService<IOptions<MeilisearchOptions>>().Value;
            return new MeilisearchClient(opts.Url, opts.MasterKey);
        });

        services.AddSingleton<ISearchProvider, MeilisearchProvider>();
        services.AddSingleton<ISearchIndexer, MeilisearchIndexer>();
        services.AddHostedService<MeilisearchInitializer>();

        return services;
    }
}
