using Application.AdminSettings;
using Application.Common.Interfaces;
using Application.SsgRebuild;
using Contracts.Admin;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

public class SsgPeriodicRebuildWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<SsgPeriodicRebuildWorker> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("SSG periodic rebuild worker started (checks every 5min)");

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(CheckInterval, stoppingToken);

            try
            {
                using var scope = scopeFactory.CreateScope();
                var settings = scope.ServiceProvider.GetRequiredService<AdminSettingsService>();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var ssgService = scope.ServiceProvider.GetRequiredService<ISsgJobService>();

                var enabled = await settings.GetBoolAsync("ssg.periodicRebuildEnabled", true, stoppingToken);
                if (!enabled)
                    continue;

                var intervalHours = await settings.GetIntAsync("ssg.periodicRebuildIntervalHours", 24, stoppingToken);
                var interval = TimeSpan.FromHours(Math.Max(intervalHours, 1));

                // Skip if a Full job completed recently
                var cutoff = DateTimeOffset.UtcNow.Add(-interval);
                var recentFull = await db.SsgRebuildJobs.AnyAsync(
                    j => j.Mode == SsgRebuildMode.Full
                         && j.Status == SsgRebuildJobStatus.Completed
                         && j.FinishedAt > cutoff,
                    stoppingToken);

                if (recentFull)
                    continue;

                var site = await db.Sites.FirstOrDefaultAsync(stoppingToken);
                if (site is null)
                    continue;

                var job = await ssgService.EnqueueSsgRebuildAsync(
                    new CreateSsgRebuildJobRequest(site.Id, "Full", Concurrency: 4),
                    stoppingToken);

                if (job is not null)
                    logger.LogInformation("Periodic SSG rebuild queued: {JobId} (interval: {Hours}h)", job.Id, intervalHours);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Periodic SSG rebuild failed");
            }
        }
    }
}
