using Application.Vocabulary;

namespace Api.Services;

// Anti-spiral F2: background reconciler promotes pending vocabulary words into
// the SRS queue once the day rolls over and a user's daily cap has free slots.
// 1h cadence — promotions should land soon after midnight UTC, and the query
// is scoped to (user, site) pairs that actually have pending rows.
public class DailyCapReconcilerWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<DailyCapReconcilerWorker> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Daily-cap reconciler started (every 1h)");

        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<DailyCapService>();
                var promoted = await service.ReconcileAllAsync(stoppingToken);
                if (promoted > 0)
                    logger.LogInformation("Daily-cap reconcile: promoted {Count} pending → SRS", promoted);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Daily-cap reconcile failed");
            }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
