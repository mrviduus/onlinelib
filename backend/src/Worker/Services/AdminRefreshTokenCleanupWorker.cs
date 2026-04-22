using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

public class AdminRefreshTokenCleanupWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AdminRefreshTokenCleanupWorker> logger) : BackgroundService
{
    // Run daily — expired rows are harmless (rejected by RefreshTokenAsync ExpiresAt filter)
    // but accumulate forever on an admin-only table. Hourly is overkill.
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Admin refresh token cleanup worker started (interval: {Interval})", Interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error during admin refresh token cleanup");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task CleanupAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();

        var now = DateTimeOffset.UtcNow;
        var deleted = await db.AdminRefreshTokens
            .Where(t => t.ExpiresAt < now)
            .ExecuteDeleteAsync(ct);

        if (deleted > 0)
            logger.LogInformation("Deleted {Count} expired admin refresh tokens", deleted);
    }
}
