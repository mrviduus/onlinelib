using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

public class GuestCleanupWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<GuestCleanupWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan ExpiryThreshold = TimeSpan.FromDays(3);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Guest cleanup worker started (interval: {Interval}, expiry: {Expiry})",
            Interval, ExpiryThreshold);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(Interval, stoppingToken);

            try
            {
                await CleanupExpiredGuestsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error during guest cleanup");
            }
        }
    }

    private async Task CleanupExpiredGuestsAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();

        var cutoff = DateTimeOffset.UtcNow - ExpiryThreshold;

        var expiredGuests = await db.Users
            .Where(u => u.IsGuest && u.LastActiveAt < cutoff)
            .Include(u => u.UserBooks)
                .ThenInclude(b => b.BookFiles)
            .ToListAsync(ct);

        if (expiredGuests.Count == 0) return;

        logger.LogInformation("Cleaning up {Count} expired guest users", expiredGuests.Count);

        foreach (var guest in expiredGuests)
        {
            try
            {
                // Delete files from storage for each book
                foreach (var book in guest.UserBooks)
                {
                    await storage.DeleteUserBookDirectoryAsync(guest.Id, book.Id, ct);
                }

                // Delete user (cascade handles UserBooks, chapters, tokens, etc.)
                db.Users.Remove(guest);
                await db.SaveChangesAsync(ct);

                logger.LogInformation("Deleted expired guest {GuestId}", guest.Id);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to delete guest {GuestId}", guest.Id);
            }
        }
    }
}
