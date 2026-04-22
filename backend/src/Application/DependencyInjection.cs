using Application.Admin;
using Application.AdminAuth;
using Application.AdminSettings;
using Application.Auth;
using Application.Authors;
using Application.Books;
using Application.Reprocessing;
using Application.Seo;
using Application.LLM;
using Application.Vocabulary;
using Application.Export;
using Application.SsgRebuild;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<AuthorsService>();
        services.AddScoped<BookService>();
        services.AddScoped<SeoService>();

        // SEO Backfill Automation
        services.AddScoped<SeoContextBuilder>();
        services.AddScoped<SeoContentApplier>();
        services.AddScoped<SeoCoverageAnalyzer>();
        services.AddScoped<SeoJobProcessor>();
        services.AddScoped<AdminService>();
        services.AddScoped<Ingestion.IngestionService>();
        services.AddScoped<AuthService>();
        services.AddScoped<AdminAuthService>();
        services.AddScoped<AdminSettingsService>();
        services.AddScoped<ReprocessingService>();
        services.AddScoped<EpubExportService>();

        // Vocabulary anti-spiral
        services.AddScoped<WeeklyBudgetService>();
        services.AddScoped<DailyCapService>();
        services.AddScoped<RetirementSweeper>();
        services.AddScoped<ClusterCandidateService>();
        services.AddSingleton<IFrequencyFilter, FrequencyFilter>();

        // LLM (OpenAI)
        services.AddSingleton<ILlmService, OpenAiLlmService>();

        // SSG Rebuild - interfaces for SOLID compliance
        services.AddScoped<ISsgRouteProvider, SsgRouteProvider>();
        services.AddScoped<ISsgJobService, SsgRebuildService>();
        services.AddScoped<SsgRebuildService>(); // Keep for backwards compatibility

        return services;
    }

    public static IServiceCollection AddAuthSettings(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JwtSettings>(configuration.GetSection(JwtSettings.SectionName));
        services.Configure<GoogleSettings>(configuration.GetSection(GoogleSettings.SectionName));
        services.Configure<AppleSettings>(configuration.GetSection(AppleSettings.SectionName));
        return services;
    }
}
