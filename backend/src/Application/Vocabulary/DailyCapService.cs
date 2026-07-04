using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Application.Vocabulary;

// Anti-spiral F2: caps how many *new* SRS words enter the active queue per day.
// Over-cap saves are dropped into PendingVocabularyWord and promoted by the
// reconciler once the next day rolls over.
//
// "Used today" = count of VocabularyWord rows whose ActivatedAt falls inside
// today's UTC window. ActivatedAt is set the moment a word joins the SRS
// queue — both for direct saves and for promotions — so both paths count
// against the cap uniformly.
public record DailyCapStatus(int Used, int Cap, int Remaining);

public class DailyCapService(IAppDbContext db)
{
    // Default = the per-user vocabulary ceiling (5000), i.e. effectively no
    // daily limit: every tapped word enters SRS immediately and you only ever
    // hit the absolute MaxWordsPerUser gate. Users can still opt into a real
    // daily cap (5–100) via vocab settings.
    public const int DefaultDailyCap = 5000;

    public async Task<DailyCapStatus> GetStatusAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        var cap = await db.UserVocabularySettings
            .Where(s => s.UserId == userId)
            .Select(s => (int?)s.DailyNewCap)
            .FirstOrDefaultAsync(ct) ?? DefaultDailyCap;

        var used = await GetUsedTodayAsync(userId, siteId, DateTimeOffset.UtcNow, ct);
        return Compute(used, cap);
    }

    public Task<int> GetUsedTodayAsync(Guid userId, Guid siteId, DateTimeOffset now, CancellationToken ct)
    {
        var todayStart = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        return db.VocabularyWords
            .Where(w => w.UserId == userId && w.ActivatedAt != null && w.ActivatedAt >= todayStart)
            .CountAsync(ct);
    }

    // Pure helper — pin inputs explicitly so tests don't need a DB shim.
    public static DailyCapStatus Compute(int used, int cap) =>
        new(Used: used, Cap: cap, Remaining: Math.Max(0, cap - used));

    // Copy the pending row's snapshot into VocabularyWord and delete the
    // pending row. Caller wraps in a transaction when calling in bulk.
    // Returns the new VocabularyWord (Stage 0, due now).
    public async Task<VocabularyWord> PromoteAsync(PendingVocabularyWord pending, DateTimeOffset now, CancellationToken ct)
    {
        var word = new VocabularyWord
        {
            Id = Guid.NewGuid(),
            UserId = pending.UserId,
            SiteId = pending.SiteId,
            Word = pending.Word,
            Language = pending.Language,
            Translation = pending.Translation,
            Definition = pending.Definition,
            EditionId = pending.EditionId,
            ChapterId = pending.ChapterId,
            UserBookId = pending.UserBookId,
            Sentence = pending.Sentence,
            BookTitle = pending.BookTitle,
            ZipfRank = pending.ZipfRank,
            ZipfScore = pending.ZipfScore,
            Priority = pending.Priority,
            Source = "pending_promoted",
            ActivatedAt = now,
            Stage = 0,
            IntervalDays = 0,
            ConsecutiveCorrect = 0,
            NextReviewAt = now,
            TotalReviews = 0,
            CorrectReviews = 0,
            CreatedAt = pending.CreatedAt,
            UpdatedAt = now,
        };
        db.VocabularyWords.Add(word);
        db.PendingVocabularyWords.Remove(pending);
        await db.SaveChangesAsync(ct);
        return word;
    }

    // Batch promotion for the reconciler: pulls top-N pending by Priority DESC
    // until the day's cap is filled. Returns count promoted.
    public async Task<int> ReconcileUserAsync(Guid userId, Guid siteId, DateTimeOffset now, CancellationToken ct)
    {
        var status = await GetStatusAsync(userId, siteId, ct);
        if (status.Remaining <= 0) return 0;

        var toPromote = await db.PendingVocabularyWords
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.Priority)
            .ThenBy(p => p.CreatedAt)
            .Take(status.Remaining)
            .ToListAsync(ct);

        if (toPromote.Count == 0) return 0;

        foreach (var pending in toPromote)
        {
            await PromoteAsync(pending, now, ct);
        }
        return toPromote.Count;
    }

    // Global reconcile — iterates distinct (user, site) pairs that have pending
    // rows. Runs per-user so capless users get theirs drained without the
    // query plan degenerating into a cross-join across the whole table.
    public async Task<int> ReconcileAllAsync(CancellationToken ct)
    {
        var scope = await db.PendingVocabularyWords
            .Select(p => new { p.UserId, p.SiteId })
            .Distinct()
            .ToListAsync(ct);

        var total = 0;
        var now = DateTimeOffset.UtcNow;
        foreach (var s in scope)
            total += await ReconcileUserAsync(s.UserId, s.SiteId, now, ct);
        return total;
    }
}
