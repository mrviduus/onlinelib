using Application.Common.Interfaces;
using Infrastructure.Persistence;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Api.Extensions;

public static partial class ServiceCollectionExtensions
{
    /// <summary>
    /// Core persistence: ICurrentSite, AppDbContext (Npgsql + pgvector + snake_case),
    /// the IAppDbContext facade, and local file storage.
    /// R1a: ICurrentSite MUST stay registered before AddDbContext.
    /// </summary>
    public static IServiceCollection AddTextStackPersistence(
        this IServiceCollection services, string connectionString, IConfiguration configuration)
    {
        services.AddSingleton<ICurrentSite>(
            sp => new CurrentSite(sp.GetRequiredService<IConfiguration>()));

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(connectionString, o => o.UseVector())
                .UseSnakeCaseNamingConvention()
                .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));

        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        // File storage
        var storagePath = configuration["Storage:RootPath"] ?? "/storage";
        services.AddSingleton<IFileStorageService>(new LocalFileStorageService(storagePath));

        return services;
    }
}
