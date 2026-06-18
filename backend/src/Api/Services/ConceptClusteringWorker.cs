using Application.Vocabulary;

namespace Api.Services;

// AI-058: weekly semantic concept clustering. Groups each user's saved vocabulary by
// meaning across all books (in-process over OpenAI word embeddings) into concept groups,
// reusing WordCluster with Kind="concept". Full-replace rebuild per (user, site).
// Mirrors ClusterCandidateBuilderWorker's shape; runs weekly (concept membership shifts
// slowly and the per-user pass is cheap), labels=AI-059, StatsPage widget=AI-060.
public class ConceptClusteringWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ConceptClusteringWorker> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromDays(7);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Concept clustering worker started (weekly)");

        try { await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<ConceptClusteringService>();
                var created = await service.BuildAllAsync(stoppingToken);
                if (created > 0)
                    logger.LogInformation("Concept clustering: created {Count} concept clusters", created);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Concept clustering build failed");
            }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
