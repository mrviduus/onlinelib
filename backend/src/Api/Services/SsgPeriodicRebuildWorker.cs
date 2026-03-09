using Application.Common.Interfaces;
using Application.SsgRebuild;
using Contracts.Admin;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

public class SsgPeriodicRebuildWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<SsgPeriodicRebuildWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = config.GetValue("Ssg:PeriodicRebuildIntervalHours", 24);
        var interval = TimeSpan.FromHours(intervalHours);

        logger.LogInformation("SSG periodic rebuild: every {Hours}h", intervalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(interval, stoppingToken);

            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var ssgService = scope.ServiceProvider.GetRequiredService<ISsgJobService>();

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
                    logger.LogInformation("Periodic SSG rebuild queued: {JobId}", job.Id);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Periodic SSG rebuild failed");
            }
        }
    }
}
