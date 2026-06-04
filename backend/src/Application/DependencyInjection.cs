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
using Microsoft.Extensions.Logging;

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

        // Legacy ILlmServiceFactory — now backed by LegacyLlmAdapter over the new
        // stack (AI-005). The old keyed Domain.LLM providers are gone; callers
        // keep this factory until they move to Core.ILlmService directly.
        services.AddSingleton<Domain.LLM.ILlmServiceFactory, LlmServiceFactory>();

        // AI platform (Ai.* libs) — new ILlmService stack (the factory routes here).
        // Trace writer: scoped (per-request DbContext); the singleton
        // TracingDecorator resolves it per-write via a fresh scope.
        services.AddScoped<global::TextStack.Ai.Core.ILlmTraceWriter, Ai.DbLlmTraceWriter>();

        // Sampling policy (Ai:Tracing:Sampling). Errors always sampled regardless.
        services.AddSingleton(sp =>
        {
            var c = sp.GetRequiredService<IConfiguration>();
            return new global::TextStack.Ai.Llm.TracingOptions(
                c.GetValue("Ai:Tracing:Sampling:Default", 1.0),
                c.GetSection("Ai:Tracing:Sampling:PerFeature").Get<Dictionary<string, double>>());
        });

        // Raw providers (keyed) on Core.ILlmService.
        services.AddKeyedSingleton<global::TextStack.Ai.Core.ILlmService, global::TextStack.Ai.Llm.OpenAiLlmClient>("openai-raw");
        services.AddKeyedSingleton<global::TextStack.Ai.Core.ILlmService, global::TextStack.Ai.Llm.OllamaLlmClient>("ollama-raw");

        // Decorated providers (keyed): TracingDecorator wraps each raw provider.
        foreach (var providerKey in new[] { "openai", "ollama" })
        {
            services.AddKeyedSingleton<global::TextStack.Ai.Core.ILlmService>(providerKey, (sp, key) =>
                new global::TextStack.Ai.Llm.TracingDecorator(
                    sp.GetRequiredKeyedService<global::TextStack.Ai.Core.ILlmService>($"{key}-raw"),
                    sp.GetRequiredService<IServiceScopeFactory>(),
                    sp.GetRequiredService<global::TextStack.Ai.Llm.TracingOptions>(),
                    sp.GetRequiredService<ILogger<global::TextStack.Ai.Llm.TracingDecorator>>()));
        }

        // Default Core.ILlmService = the gateway (routes FeatureTag → decorated provider).
        services.AddSingleton<global::TextStack.Ai.Core.ILlmService, global::TextStack.Ai.Llm.ModelGateway>();

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
