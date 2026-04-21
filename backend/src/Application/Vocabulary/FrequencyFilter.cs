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
// Backed by a process-wide in-memory cache (~20k en rows ≈ 1 MB). Loads once
// lazily on first call; re-load is not supported since startup seeder is the
// source of truth.
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

    private readonly ConcurrentDictionary<string, Entry> _cache = new();
    private readonly SemaphoreSlim _loadLock = new(1, 1);
    private volatile bool _loaded;

    public async Task<FrequencyClassification> ClassifyAsync(string word, string language, int currentTapCount, CancellationToken ct)
    {
        await EnsureLoadedAsync(ct);

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

            foreach (var r in rows)
                _cache[Key(r.Language, r.Word)] = new Entry(r.Rank, r.Zipf, r.Pos);

            _loaded = true;
            logger.LogInformation("FrequencyFilter loaded {Count} rows", rows.Count);
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
