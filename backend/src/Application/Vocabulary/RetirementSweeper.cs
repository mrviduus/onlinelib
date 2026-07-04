using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using TextStack.Vocabulary;

namespace Application.Vocabulary;

// Anti-spiral F4: flips IsRetired on Mastered words with ≥3 consecutive correct
// and interval ≥14d. Scans per user so AutoRetireEnabled=false is respected
// without a cross-join in the query plan.
public class RetirementSweeper(IAppDbContext db, ISrsEngine srs)
{
    public const string AutoReason = "auto_3_correct_long_interval";

    // Returns count of rows flipped.
    public async Task<int> SweepAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        var settings = await db.UserVocabularySettings
            .FirstOrDefaultAsync(s => s.UserId == userId, ct);
        if (settings is { AutoRetireEnabled: false }) return 0;

        // Pull candidates — Mastered + not already retired. Evaluating the rule
        // in memory lets us keep ISrsEngine as the single source of truth for
        // the threshold (avoid duplicating 3/14 constants in an EF expression).
        var candidates = await db.VocabularyWords
            .Where(w => w.UserId == userId
                     && !w.IsRetired
                     && w.Stage == 4
                     && w.ConsecutiveCorrect >= 3
                     && w.IntervalDays >= 14)
            .ToListAsync(ct);

        var flipped = 0;
        var now = DateTimeOffset.UtcNow;
        foreach (var w in candidates)
        {
            if (!srs.ShouldAutoRetire(w.Stage, w.ConsecutiveCorrect, w.IntervalDays)) continue;
            w.IsRetired = true;
            w.RetiredAt = now;
            w.RetiredReason = AutoReason;
            w.UpdatedAt = now;
            flipped++;
        }

        if (flipped > 0) await db.SaveChangesAsync(ct);
        return flipped;
    }

    // Global sweep across all users — used by the 6h background worker.
    public async Task<int> SweepAllAsync(CancellationToken ct)
    {
        var scope = await db.VocabularyWords
            .Where(w => !w.IsRetired && w.Stage == 4 && w.ConsecutiveCorrect >= 3 && w.IntervalDays >= 14)
            .Select(w => new { w.UserId, w.SiteId })
            .Distinct()
            .ToListAsync(ct);

        var total = 0;
        foreach (var s in scope)
            total += await SweepAsync(s.UserId, s.SiteId, ct);
        return total;
    }
}
