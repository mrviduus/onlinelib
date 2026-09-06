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

        ProbeWritable(path);

        while (!stoppingToken.IsCancellationRequested)
        {
            Sweep(path, maxAge);
            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>
    /// Say so, once, at startup if the cache cannot be written.
    /// </summary>
    /// <remarks>
    /// Every cache write is best-effort by design — a broken volume must degrade to "no cache",
    /// never to a 500 on a word tap. The cost of that choice is silence: the bind mount is created
    /// by Docker as root, the container runs as uid 1000, and <c>Directory.CreateDirectory</c>
    /// succeeds trivially on an existing mount point, so the first sign of trouble is an outage
    /// where the fallback turns out not to exist. That is not hypothetical — it is how this shipped
    /// the first time, and CI caught it only because one test asked for the same word twice.
    /// A probe cannot fix the permissions, but it turns a silent absence into a line in the log.
    /// </remarks>
    private void ProbeWritable(string path)
    {
        var probe = Path.Combine(path, $".writable-probe-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(path);
            File.WriteAllText(probe, string.Empty);
            File.Delete(probe);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Dictionary cache at {Path} is not writable — lookups will still work, but there is " +
                "no fallback when the upstream dictionary is unreachable. On the server this is " +
                "`make fix-permissions` (the dir must be owned by uid 1000).", path);
            try { File.Delete(probe); } catch { /* nothing to clean up */ }
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
