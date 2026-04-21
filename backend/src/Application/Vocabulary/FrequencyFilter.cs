using System.Collections.Concurrent;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Application.Vocabulary;

// Anti-spiral F1: classifies a tapped word by corpus frequency.
//
// Tiers:
//   rank 1..TierInstantMax     → SrsEligible    — common word, straight to SRS
//   rank ..TierCommitMax       → RequiresRetap  — user must tap 2x before it enters SRS
//   rank > TierCommitMax / OOV → LookupOnly     — goes to WordLookup (reference only)
//
// Pos='PROPN' → always LookupOnly (proper nouns aren't vocab-worthy).
//
// Backed by a process-wide in-memory cache. Loads lazily; fail-open:
//   - language has no rows in dataset (e.g. reading a French book, seed is en-only)
//     → SrsEligible for everything, treat filter as disabled for that language.
//   - cache underflows MinLoadedRows (seeder still running) → retry on next call
//     instead of poisoning classification forever.
public enum FrequencyClassKind
{
    SrsEligible,
    RequiresRetap,
    LookupOnly,
}

public record FrequencyClassification(
    FrequencyClassKind Kind,
    int? ZipfRank,
    double? ZipfScore,
    int RequiredTaps,
    string? Reason);

public interface IFrequencyFilter
{
    Task<FrequencyClassification> ClassifyAsync(string word, string language, int currentTapCount, CancellationToken ct);
}

public class FrequencyFilter(
    IServiceScopeFactory scopeFactory,
    ILogger<FrequencyFilter> logger) : IFrequencyFilter
{
    public const int TierInstantMax = 5000;
    public const int TierCommitMax = 15000;
    public const int RetapRequired = 2;
    private const int MinLoadedRows = 15000;

    private readonly ConcurrentDictionary<string, Entry> _cache = new();
    private readonly HashSet<string> _supportedLanguages = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _loadLock = new(1, 1);
    private volatile bool _loaded;

    public async Task<FrequencyClassification> ClassifyAsync(string word, string language, int currentTapCount, CancellationToken ct)
    {
        await EnsureLoadedAsync(ct);

        // Fail-open. Covers two cases:
        //   1. Non-English book — dataset is en-only; we don't have the data to
        //      filter, so trust the tap and send to SRS.
        //   2. Seed still in progress — EnsureLoadedAsync won't mark _loaded
        //      true until MinLoadedRows hit, but this guard belts-and-braces
        //      against ever treating the user's entire vocabulary as "rare".
        if (!_supportedLanguages.Contains(language))
            return new(FrequencyClassKind.SrsEligible, null, null, 1, null);

        var key = Key(language, word);
        if (_cache.TryGetValue(key, out var e))
        {
            if (string.Equals(e.Pos, "PROPN", StringComparison.OrdinalIgnoreCase))
                return new(FrequencyClassKind.LookupOnly, e.Rank, e.Zipf, 0, "proper_noun");

            if (e.Rank <= TierInstantMax)
                return new(FrequencyClassKind.SrsEligible, e.Rank, e.Zipf, 1, null);

            if (e.Rank <= TierCommitMax)
            {
                if (currentTapCount + 1 >= RetapRequired)
                    return new(FrequencyClassKind.SrsEligible, e.Rank, e.Zipf, RetapRequired, null);
                return new(FrequencyClassKind.RequiresRetap, e.Rank, e.Zipf, RetapRequired, "mid_tier");
            }

            return new(FrequencyClassKind.LookupOnly, e.Rank, e.Zipf, 0, "rare_word");
        }

        // OOV — not in top dataset. Treat as rare; no rank/zipf.
        return new(FrequencyClassKind.LookupOnly, null, null, 0, "rare_word");
    }

    private async Task EnsureLoadedAsync(CancellationToken ct)
    {
        if (_loaded) return;
        await _loadLock.WaitAsync(ct);
        try
        {
            if (_loaded) return;

            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
            var rows = await db.WordFrequencies
                .AsNoTracking()
                .Select(w => new { w.Language, w.Word, w.Rank, w.Zipf, w.Pos })
                .ToListAsync(ct);

            // Short-circuit: seeder hasn't finished. Don't flip `_loaded` — the
            // next Classify call re-enters and retries, so we don't permanently
            // poison classification by caching a half-seeded snapshot.
            if (rows.Count < MinLoadedRows)
            {
                logger.LogWarning("FrequencyFilter skipped cache: {Count}/{Min} rows — seeder not ready",
                    rows.Count, MinLoadedRows);
                return;
            }

            foreach (var r in rows)
            {
                _cache[Key(r.Language, r.Word)] = new Entry(r.Rank, r.Zipf, r.Pos);
                _supportedLanguages.Add(r.Language);
            }

            _loaded = true;
            logger.LogInformation("FrequencyFilter loaded {Count} rows across {Langs} language(s)",
                rows.Count, _supportedLanguages.Count);
        }
        finally
        {
            _loadLock.Release();
        }
    }

    private static string Key(string language, string word) =>
        string.Concat(language.ToLowerInvariant(), ":", word.ToLowerInvariant());

    private sealed record Entry(int Rank, double Zipf, string? Pos);
}
