using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

public class IngestionWorker : BackgroundService
{
    private readonly IngestionService _ingestionService;
    private readonly ILogger<IngestionWorker> _logger;
    private readonly TimeSpan _pollInterval = TimeSpan.FromSeconds(5);

    public IngestionWorker(IngestionService ingestionService, ILogger<IngestionWorker> logger)
    {
        _ingestionService = ingestionService;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Ingestion worker started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var job = await _ingestionService.GetNextJobAsync(stoppingToken);

                if (job is not null)
                {
                    _logger.LogInformation("Found job {JobId}, processing...", job.Id);
                    await _ingestionService.ProcessJobAsync(job.Id, stoppingToken);
                }
                else
                {
                    await Task.Delay(_pollInterval, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in ingestion worker loop");
                await Task.Delay(_pollInterval, stoppingToken);
            }
        }

        _logger.LogInformation("Ingestion worker stopped");
    }
}
