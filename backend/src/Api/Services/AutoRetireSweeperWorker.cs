using Application.Vocabulary;

namespace Api.Services;

// Anti-spiral F4: background sweep flips Mastered words with ≥3 consecutive
// correct and interval ≥14d to IsRetired=true, removing them from the review
// queue. 6h cadence — retirement isn't latency-sensitive; the cost is a full
// scan of VocabularyWords so we don't want to hammer it.
public class AutoRetireSweeperWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AutoRetireSweeperWorker> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Auto-retire sweeper started (every 6h)");

        // Short initial delay so startup doesn't immediately spike DB load.
        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var sweeper = scope.ServiceProvider.GetRequiredService<RetirementSweeper>();
                var flipped = await sweeper.SweepAllAsync(stoppingToken);
                if (flipped > 0)
                    logger.LogInformation("Auto-retire sweep: flipped {Count} words to IsRetired", flipped);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Auto-retire sweep failed");
            }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
