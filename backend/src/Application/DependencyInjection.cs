using Application.Admin;
using Application.Books;
using Application.Search;
using Application.Seo;
using Application.Sites;
using Microsoft.Extensions.DependencyInjection;

namespace Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<BookService>();
        services.AddScoped<SeoService>();
        services.AddScoped<SearchService>();
        services.AddScoped<AdminService>();
        services.AddScoped<SiteService>();
        services.AddScoped<Ingestion.IngestionService>();
        return services;
    }
}
