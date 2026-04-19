using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

public class ReadingRoomCleanupWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ReadingRoomCleanupWorker> logger) : BackgroundService
{
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan IdleThreshold = TimeSpan.FromDays(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "ReadingRoom cleanup worker started (interval: {Interval}, idle: {Idle})",
            Interval, IdleThreshold);

        var delay = InitialDelay;
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(delay, stoppingToken);
            delay = Interval;

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
                logger.LogError(ex, "ReadingRoom cleanup error");
            }
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();

        var now = DateTimeOffset.UtcNow;
        var cutoff = now - IdleThreshold;

        // Close rooms idle >30 days. No hard delete — audit / re-open later.
        var stale = await db.ReadingRooms
            .Where(r => r.ClosedAt == null && r.LastActivityAt < cutoff)
            .ToListAsync(ct);
        foreach (var r in stale) r.ClosedAt = now;
        if (stale.Count > 0)
            logger.LogInformation("Auto-closed {Count} idle rooms", stale.Count);

        // Purge expired invites that are already revoked or fully used — kept only for audit up to 7d past expiry.
        var invitePurgeCutoff = now - TimeSpan.FromDays(7);
        var deadInvites = await db.ReadingRoomInvites
            .Where(i => i.ExpiresAt < invitePurgeCutoff)
            .ToListAsync(ct);
        foreach (var i in deadInvites) db.ReadingRoomInvites.Remove(i);
        if (deadInvites.Count > 0)
            logger.LogInformation("Purged {Count} expired invites", deadInvites.Count);

        if (stale.Count > 0 || deadInvites.Count > 0)
            await db.SaveChangesAsync(ct);
    }
}
