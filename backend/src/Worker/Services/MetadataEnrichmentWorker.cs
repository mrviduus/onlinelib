using Domain.Enums;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

/// <summary>
/// Sweep that (a) drains <see cref="MetadataEnrichmentStatus.Pending"/> user books — this is how the API's
/// re-enrich request reaches the worker, since the API host has no enrichment executor — and (b) recovers
/// dead-process rows stuck in <see cref="MetadataEnrichmentStatus.Running"/> past the stale window back to
/// Pending. Fresh ingestions are inline-kicked for latency; the atomic claim in
/// <see cref="UserBookEnrichmentService.EnrichAsync"/> guards the sweep from double-running them.
/// </summary>
public class MetadataEnrichmentWorker(
    IDbContextFactory<AppDbContext> dbFactory,
    UserBookEnrichmentService enrichmentService,
    ILogger<MetadataEnrichmentWorker> logger) : BackgroundService
{
    // Short interval: re-enrich requests should feel near-immediate, and the work is cheap (a bounded
    // claim query + fire best-effort). Mirrors GuestCleanupWorker's delay-loop shape.
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);
    // A Running row untouched for this long means the process that claimed it died mid-run → reclaim.
    private static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(10);
    private const int BatchSize = 20;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Metadata enrichment worker started (interval: {Interval}, stale: {Stale})", Interval, StaleAfter);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error during metadata enrichment sweep");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        // (b) Dead-process recovery: reclaim stale Running rows so they get another attempt.
        var staleCutoff = DateTimeOffset.UtcNow - StaleAfter;
        var reclaimed = await db.UserBooks
            .Where(b => b.MetadataEnrichmentStatus == MetadataEnrichmentStatus.Running
                        && b.MetadataEnrichmentAt < staleCutoff)
            .ExecuteUpdateAsync(s => s
                .SetProperty(b => b.MetadataEnrichmentStatus, MetadataEnrichmentStatus.Pending), ct);

        if (reclaimed > 0)
            logger.LogWarning("Reclaimed {Count} stale Running enrichment row(s) to Pending", reclaimed);

        // (a) Drain Pending: the per-book atomic claim in EnrichAsync makes this safe against the inline-kick.
        var pendingIds = await db.UserBooks
            .Where(b => b.MetadataEnrichmentStatus == MetadataEnrichmentStatus.Pending)
            .OrderBy(b => b.CreatedAt)
            .Select(b => b.Id)
            .Take(BatchSize)
            .ToListAsync(ct);

        foreach (var id in pendingIds)
        {
            ct.ThrowIfCancellationRequested();
            await enrichmentService.EnrichAsync(id, ct);
        }
    }
}
