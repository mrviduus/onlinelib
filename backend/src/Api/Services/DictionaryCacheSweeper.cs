namespace Api.Services;

/// <summary>
/// Bounds the dictionary file cache. Same shape as the <c>EdgeTtsService</c> sweep, with one
/// deliberate difference: it does NOT delete on the freshness TTL. An entry past its 30-day TTL is
/// the outage fallback — deleting it is exactly what we are trying to avoid — so retention is a
/// separate, much longer bound (<c>Dictionary:CacheMaxAgeDays</c>, default 365). Entries are ~1KB
/// of JSON, so this is disk hygiene, not pressure relief.
/// </summary>
public class DictionaryCacheSweeper(
    IConfiguration config,
    ILogger<DictionaryCacheSweeper> logger) : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(24);

    /// <summary>A .tmp older than this lost its writer (killed mid-write) and will never be renamed.</summary>
    private static readonly TimeSpan OrphanTmpAge = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var path = config.GetValue<string>("Dictionary:CachePath");
        if (string.IsNullOrWhiteSpace(path))
            return;

        var maxAge = TimeSpan.FromDays(Math.Max(1, config.GetValue("Dictionary:CacheMaxAgeDays", 365)));

        while (!stoppingToken.IsCancellationRequested)
        {
            Sweep(path, maxAge);
            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private void Sweep(string path, TimeSpan maxAge)
    {
        try
        {
            if (!Directory.Exists(path))
                return;

            var now = DateTime.UtcNow;
            var deleted = 0;
            foreach (var file in Directory.EnumerateFiles(path))
            {
                var age = now - File.GetLastWriteTimeUtc(file);
                var limit = file.EndsWith(".tmp", StringComparison.Ordinal) ? OrphanTmpAge : maxAge;
                if (age <= limit)
                    continue;
                try
                {
                    File.Delete(file);
                    deleted++;
                }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                {
                    // another request may have just rewritten it; next sweep retries
                }
            }

            if (deleted > 0)
                logger.LogInformation("Dictionary cache sweep removed {Count} expired entries", deleted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Dictionary cache sweep failed at {Path}", path);
        }
    }
}
