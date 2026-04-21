using Application.Vocabulary;

namespace Api.Services;

// Anti-spiral F3: every 24h scans recently-activated SRS words per user,
// groups by book context, asks the LLM whether any group forms a cohesive
// theme, and creates WordCluster rows for the post-session bonus card.
public class ClusterCandidateBuilderWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ClusterCandidateBuilderWorker> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Cluster candidate builder started (every 24h)");

        try { await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<ClusterCandidateService>();
                var created = await service.BuildAllAsync(stoppingToken);
                if (created > 0)
                    logger.LogInformation("Cluster candidate build: created {Count} clusters", created);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Cluster candidate build failed");
            }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
