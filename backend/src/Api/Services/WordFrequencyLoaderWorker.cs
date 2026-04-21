using System.IO.Compression;
using System.Reflection;
using System.Text.Json;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

// Anti-spiral F1: seeds word_frequencies on startup from an embedded gzipped
// JSON (hermitdave en_50k, OpenSubtitles-derived, top-20k ≥ Zipf 2.0).
// Idempotent: skips if table already has ≥ MinRows. Runs once then exits.
public class WordFrequencyLoaderWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<WordFrequencyLoaderWorker> logger) : BackgroundService
{
    private const string ResourceName = "Infrastructure.Persistence.Data.wordfreq-en.json.gz";
    private const string Language = "en";
    private const int MinRows = 15000;
    private const int BatchSize = 2000;
    private const int MaxAttempts = 5;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
        catch (OperationCanceledException) { return; }

        // Retry with backoff so a DB that's briefly unreachable at startup
        // doesn't leave word_frequencies empty for the life of the process —
        // which would otherwise silently degrade the filter into a no-op.
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                if (await TrySeedAsync(stoppingToken)) return;
                return; // succeeded or skipped (already seeded / empty resource)
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                if (attempt == MaxAttempts)
                {
                    logger.LogError(ex, "WordFrequency seed failed after {Attempts} attempts — filter will fail-open", MaxAttempts);
                    return;
                }
                var backoff = TimeSpan.FromSeconds(Math.Min(60, 5 * attempt));
                logger.LogWarning(ex, "WordFrequency seed attempt {Attempt} failed; retrying in {Sec}s", attempt, backoff.TotalSeconds);
                try { await Task.Delay(backoff, stoppingToken); }
                catch (OperationCanceledException) { return; }
            }
        }
    }

    private async Task<bool> TrySeedAsync(CancellationToken stoppingToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();

        var existing = await db.WordFrequencies.CountAsync(w => w.Language == Language, stoppingToken);
        if (existing >= MinRows)
        {
            logger.LogInformation("WordFrequency seed skipped: {Count} rows already loaded for '{Lang}'", existing, Language);
            return true;
        }

        var entries = LoadFromEmbedded();
        if (entries.Count == 0)
        {
            logger.LogWarning("WordFrequency seed: embedded resource empty or missing");
            return true;
        }

        // Wipe any partial seed so we don't hit the unique (language, word) index.
        if (existing > 0)
            await db.WordFrequencies
                .Where(w => w.Language == Language)
                .ExecuteDeleteAsync(stoppingToken);

        var now = DateTimeOffset.UtcNow;
        var total = 0;
        for (var i = 0; i < entries.Count; i += BatchSize)
        {
            if (stoppingToken.IsCancellationRequested) return false;
            var chunk = entries.Skip(i).Take(BatchSize)
                .Select(e => new WordFrequency
                {
                    Id = Guid.NewGuid(),
                    Language = Language,
                    Word = e.Word,
                    Rank = e.Rank,
                    Zipf = e.Zipf,
                })
                .ToList();
            db.WordFrequencies.AddRange(chunk);
            await db.SaveChangesAsync(stoppingToken);
            total += chunk.Count;
        }

        logger.LogInformation("WordFrequency seed: loaded {Count} '{Lang}' rows in {Ms}ms",
            total, Language, (DateTimeOffset.UtcNow - now).TotalMilliseconds);
        return true;
    }

    private static List<Entry> LoadFromEmbedded()
    {
        var asm = typeof(Infrastructure.Persistence.AppDbContext).Assembly;
        using var stream = asm.GetManifestResourceStream(ResourceName);
        if (stream is null) return [];
        using var gz = new GZipStream(stream, CompressionMode.Decompress);
        var parsed = JsonSerializer.Deserialize<List<Entry>>(gz, JsonOpts);
        return parsed ?? [];
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private sealed record Entry(string Word, int Rank, double Zipf);
}
