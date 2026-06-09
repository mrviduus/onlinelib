using Application.Common.Interfaces;
using Contracts.Library;
using Microsoft.EntityFrameworkCore;

namespace Application.Library;

public class LibraryShelvesService(IAppDbContext db)
{
    private const int ShelfLimit = 10;
    private const int RecentlyAddedDays = 14;
    private const int QuickReadMaxMinutes = 60;
    private const double InProgressMinPercent = 0.0;
    private const double InProgressMaxPercent = 0.95;
    private const decimal MinSanePace = 50m;
    private const decimal FallbackPace = 200m;

    public async Task<LibraryShelvesDto> GetShelvesAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var recentCutoff = now.AddDays(-RecentlyAddedDays);
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var pace = await ComputeUserPaceAsync(userId, ct);

        var continueReading = await GetContinueReadingAsync(userId, siteId, pace, ct);
        var recentlyAdded = await GetRecentlyAddedAsync(userId, siteId, recentCutoff, pace, ct);
        var quickReads = await GetQuickReadsAsync(userId, siteId, pace, ct);
        var finishedThisMonth = await GetFinishedThisMonthAsync(userId, siteId, monthStart, ct);

        return new LibraryShelvesDto(continueReading, recentlyAdded, quickReads, finishedThisMonth);
    }

    private async Task<decimal> ComputeUserPaceAsync(Guid userId, CancellationToken ct)
    {
        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.DurationSeconds > 0)
            .Select(s => new { s.DurationSeconds, s.WordsRead })
            .ToListAsync(ct);

        if (sessions.Count == 0) return FallbackPace;

        var totalMinutes = sessions.Sum(s => (long)s.DurationSeconds) / 60m;
        var totalWords = sessions.Sum(s => s.WordsRead);
        if (totalMinutes <= 0) return FallbackPace;

        var pace = totalWords / totalMinutes;
        return pace >= MinSanePace ? pace : FallbackPace;
    }

    private async Task<IReadOnlyList<LibraryShelfItemDto>> GetContinueReadingAsync(
        Guid userId, Guid siteId, decimal pace, CancellationToken ct)
    {
        var uploads = await db.UserBooks
            .Where(b => b.UserId == userId
                && b.TakedownAt == null
                && b.ProgressPercent != null
                && b.ProgressPercent > InProgressMinPercent
                && b.ProgressPercent < InProgressMaxPercent
                && b.CompletedAt == null)
            .OrderByDescending(b => b.ProgressUpdatedAt)
            .Take(ShelfLimit * 2)
            .Select(b => new
            {
                b.Id,
                b.Title,
                b.Author,
                b.CoverPath,
                b.Slug,
                b.Language,
                Progress = b.ProgressPercent ?? 0,
                b.ProgressChapterSlug,
                LastOpened = b.ProgressUpdatedAt,
                b.CreatedAt,
                b.TotalWordCount
            })
            .ToListAsync(ct);

        var savedQuery =
            from ul in db.UserLibraries
            where ul.UserId == userId
            join e in db.Editions on ul.EditionId equals e.Id
            where e.SiteId == siteId
            let latestProgress = db.ReadingProgresses
                .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new { p.Percent, p.UpdatedAt, p.ChapterId, p.Locator })
                .FirstOrDefault()
            where latestProgress != null
                && latestProgress.Percent != null
                && latestProgress.Percent > InProgressMinPercent
                && latestProgress.Percent < InProgressMaxPercent
            orderby latestProgress.UpdatedAt descending
            select new
            {
                e.Id,
                e.Title,
                Author = (string?)e.EditionAuthors
                    .OrderBy(ea => ea.Order)
                    .Select(ea => ea.Author.Name)
                    .FirstOrDefault(),
                e.CoverPath,
                e.Slug,
                e.Language,
                Progress = latestProgress.Percent ?? 0,
                CurrentChapterId = (Guid?)latestProgress.ChapterId,
                CurrentLocator = latestProgress.Locator,
                LastOpened = (DateTimeOffset?)latestProgress.UpdatedAt,
                ul.CreatedAt,
                TotalWordCount = (int?)db.Chapters
                    .Where(c => c.EditionId == e.Id)
                    .Sum(c => (int?)c.WordCount ?? 0)
            };

        var saved = await savedQuery.Take(ShelfLimit * 2).ToListAsync(ct);

        // Chapter-level percent → book-level percent (the "85% on chapter 2" fix).
        var bookPctUploads = await ComputeUserBookPercentsAsync(
            uploads.Select(u => (u.Id, u.ProgressChapterSlug, u.Progress)).ToList(), ct);
        var bookPctSaved = await ComputeEditionBookPercentsAsync(
            saved.Select(s => (s.Id, s.CurrentChapterId, s.CurrentLocator, s.Progress)).ToList(), ct);

        var merged = uploads
            .Select(u =>
            {
                var p = BookPct(bookPctUploads, u.Id, u.Progress);
                return new LibraryShelfItemDto(
                    u.Id, "userbook", u.Title, u.Author, u.CoverPath, u.Slug, u.Language,
                    p, u.LastOpened, u.CreatedAt,
                    EstimateRemaining(u.TotalWordCount, p, pace));
            })
            .Concat(saved.Select(s =>
            {
                var p = BookPct(bookPctSaved, s.Id, s.Progress);
                return new LibraryShelfItemDto(
                    s.Id, "savedbook", s.Title, s.Author, s.CoverPath, s.Slug, s.Language,
                    p, s.LastOpened, s.CreatedAt,
                    EstimateRemaining(s.TotalWordCount, p, pace));
            }))
            .OrderByDescending(i => i.LastOpenedAt ?? DateTimeOffset.MinValue)
            .Take(ShelfLimit)
            .ToList();

        return merged;
    }

    private async Task<IReadOnlyList<LibraryShelfItemDto>> GetRecentlyAddedAsync(
        Guid userId, Guid siteId, DateTimeOffset cutoff, decimal pace, CancellationToken ct)
    {
        var uploads = await db.UserBooks
            .Where(b => b.UserId == userId
                && b.TakedownAt == null
                && b.CreatedAt >= cutoff)
            .OrderByDescending(b => b.CreatedAt)
            .Take(ShelfLimit * 2)
            .Select(b => new
            {
                b.Id,
                b.Title,
                b.Author,
                b.CoverPath,
                b.Slug,
                b.Language,
                Progress = b.ProgressPercent ?? 0,
                b.ProgressChapterSlug,
                LastOpened = b.ProgressUpdatedAt,
                b.CreatedAt,
                b.TotalWordCount
            })
            .ToListAsync(ct);

        var saved = await (
            from ul in db.UserLibraries
            where ul.UserId == userId && ul.CreatedAt >= cutoff
            join e in db.Editions on ul.EditionId equals e.Id
            where e.SiteId == siteId
            let latest = db.ReadingProgresses
                .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new { p.Percent, p.UpdatedAt, p.ChapterId, p.Locator })
                .FirstOrDefault()
            orderby ul.CreatedAt descending
            select new
            {
                e.Id,
                e.Title,
                Author = (string?)e.EditionAuthors
                    .OrderBy(ea => ea.Order)
                    .Select(ea => ea.Author.Name)
                    .FirstOrDefault(),
                e.CoverPath,
                e.Slug,
                e.Language,
                ul.CreatedAt,
                LatestProgress = latest != null ? latest.Percent : null,
                CurrentChapterId = latest != null ? (Guid?)latest.ChapterId : null,
                CurrentLocator = latest != null ? latest.Locator : null,
                LastOpened = latest != null ? (DateTimeOffset?)latest.UpdatedAt : null,
                TotalWordCount = (int?)db.Chapters
                    .Where(c => c.EditionId == e.Id)
                    .Sum(c => (int?)c.WordCount ?? 0)
            }).Take(ShelfLimit * 2).ToListAsync(ct);

        var bookPctUploads = await ComputeUserBookPercentsAsync(
            uploads.Select(u => (u.Id, u.ProgressChapterSlug, u.Progress)).ToList(), ct);
        var bookPctSaved = await ComputeEditionBookPercentsAsync(
            saved.Select(s => (s.Id, s.CurrentChapterId, s.CurrentLocator, s.LatestProgress ?? 0)).ToList(), ct);

        return uploads
            .Select(u =>
            {
                var p = BookPct(bookPctUploads, u.Id, u.Progress);
                return new LibraryShelfItemDto(
                    u.Id, "userbook", u.Title, u.Author, u.CoverPath, u.Slug, u.Language,
                    p, u.LastOpened, u.CreatedAt,
                    EstimateRemaining(u.TotalWordCount, p, pace));
            })
            .Concat(saved.Select(s =>
            {
                var p = BookPct(bookPctSaved, s.Id, s.LatestProgress ?? 0);
                return new LibraryShelfItemDto(
                    s.Id, "savedbook", s.Title, s.Author, s.CoverPath, s.Slug, s.Language,
                    p, s.LastOpened, s.CreatedAt,
                    EstimateRemaining(s.TotalWordCount, p, pace));
            }))
            .OrderByDescending(i => i.CreatedAt)
            .Take(ShelfLimit)
            .ToList();
    }

    private async Task<IReadOnlyList<LibraryShelfItemDto>> GetQuickReadsAsync(
        Guid userId, Guid siteId, decimal pace, CancellationToken ct)
    {
        if (pace < MinSanePace) return Array.Empty<LibraryShelfItemDto>();

        var uploads = await db.UserBooks
            .Where(b => b.UserId == userId
                && b.TakedownAt == null
                && b.CompletedAt == null
                && b.TotalWordCount != null
                && b.TotalWordCount > 0
                && (b.ProgressPercent ?? 0) < InProgressMaxPercent)
            .OrderBy(b => b.TotalWordCount)
            .Take(ShelfLimit * 4)
            .Select(b => new
            {
                b.Id,
                b.Title,
                b.Author,
                b.CoverPath,
                b.Slug,
                b.Language,
                Progress = b.ProgressPercent ?? 0,
                b.ProgressChapterSlug,
                LastOpened = b.ProgressUpdatedAt,
                b.CreatedAt,
                b.TotalWordCount
            })
            .ToListAsync(ct);

        var saved = await (
            from ul in db.UserLibraries
            where ul.UserId == userId
            join e in db.Editions on ul.EditionId equals e.Id
            where e.SiteId == siteId
            let totalWords = db.Chapters
                .Where(c => c.EditionId == e.Id)
                .Sum(c => (int?)c.WordCount ?? 0)
            let latest = db.ReadingProgresses
                .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new { p.Percent, p.UpdatedAt, p.ChapterId, p.Locator })
                .FirstOrDefault()
            where totalWords > 0 && ((latest != null ? latest.Percent : null) ?? 0) < InProgressMaxPercent
            orderby totalWords
            select new
            {
                e.Id,
                e.Title,
                Author = (string?)e.EditionAuthors
                    .OrderBy(ea => ea.Order)
                    .Select(ea => ea.Author.Name)
                    .FirstOrDefault(),
                e.CoverPath,
                e.Slug,
                e.Language,
                Progress = (latest != null ? latest.Percent : null) ?? 0,
                CurrentChapterId = latest != null ? (Guid?)latest.ChapterId : null,
                CurrentLocator = latest != null ? latest.Locator : null,
                LastOpened = latest != null ? (DateTimeOffset?)latest.UpdatedAt : null,
                ul.CreatedAt,
                TotalWordCount = (int?)totalWords
            }).Take(ShelfLimit * 4).ToListAsync(ct);

        var bookPctUploads = await ComputeUserBookPercentsAsync(
            uploads.Select(u => (u.Id, u.ProgressChapterSlug, u.Progress)).ToList(), ct);
        var bookPctSaved = await ComputeEditionBookPercentsAsync(
            saved.Select(s => (s.Id, s.CurrentChapterId, s.CurrentLocator, s.Progress)).ToList(), ct);

        bool IsQuick(int? words, double progress)
        {
            if (words is null or <= 0) return false;
            var remaining = EstimateRemaining(words, progress, pace);
            return remaining is > 0 and <= QuickReadMaxMinutes;
        }

        return uploads
            .Select(u => (Item: u, Pct: BookPct(bookPctUploads, u.Id, u.Progress)))
            .Where(x => IsQuick(x.Item.TotalWordCount, x.Pct))
            .Select(x => new LibraryShelfItemDto(
                x.Item.Id, "userbook", x.Item.Title, x.Item.Author, x.Item.CoverPath, x.Item.Slug, x.Item.Language,
                x.Pct, x.Item.LastOpened, x.Item.CreatedAt,
                EstimateRemaining(x.Item.TotalWordCount, x.Pct, pace)))
            .Concat(saved
                .Select(s => (Item: s, Pct: BookPct(bookPctSaved, s.Id, s.Progress)))
                .Where(x => IsQuick(x.Item.TotalWordCount, x.Pct))
                .Select(x => new LibraryShelfItemDto(
                    x.Item.Id, "savedbook", x.Item.Title, x.Item.Author, x.Item.CoverPath, x.Item.Slug, x.Item.Language,
                    x.Pct, x.Item.LastOpened, x.Item.CreatedAt,
                    EstimateRemaining(x.Item.TotalWordCount, x.Pct, pace))))
            .OrderBy(i => i.EstimatedMinutesRemaining ?? int.MaxValue)
            .Take(ShelfLimit)
            .ToList();
    }

    private async Task<IReadOnlyList<LibraryShelfItemDto>> GetFinishedThisMonthAsync(
        Guid userId, Guid siteId, DateTimeOffset monthStart, CancellationToken ct)
    {
        var uploads = await db.UserBooks
            .Where(b => b.UserId == userId
                && b.TakedownAt == null
                && b.CompletedAt != null
                && b.CompletedAt >= monthStart)
            .OrderByDescending(b => b.CompletedAt)
            .Take(ShelfLimit * 2)
            .Select(b => new
            {
                b.Id,
                b.Title,
                b.Author,
                b.CoverPath,
                b.Slug,
                b.Language,
                FinishedAt = b.CompletedAt!.Value,
                b.CreatedAt
            })
            .ToListAsync(ct);

        var saved = await (
            from ul in db.UserLibraries
            where ul.UserId == userId
            join e in db.Editions on ul.EditionId equals e.Id
            where e.SiteId == siteId
            let latest = db.ReadingProgresses
                .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new { p.Percent, p.UpdatedAt })
                .FirstOrDefault()
            where latest != null
                && latest.Percent != null
                && latest.Percent >= InProgressMaxPercent
                && latest.UpdatedAt >= monthStart
            orderby latest.UpdatedAt descending
            select new
            {
                e.Id,
                e.Title,
                Author = (string?)e.EditionAuthors
                    .OrderBy(ea => ea.Order)
                    .Select(ea => ea.Author.Name)
                    .FirstOrDefault(),
                e.CoverPath,
                e.Slug,
                e.Language,
                FinishedAt = latest.UpdatedAt,
                ul.CreatedAt
            }).Take(ShelfLimit * 2).ToListAsync(ct);

        return uploads
            .Select(u => new LibraryShelfItemDto(
                u.Id, "userbook", u.Title, u.Author, u.CoverPath, u.Slug, u.Language,
                1.0, u.FinishedAt, u.CreatedAt, null))
            .Concat(saved.Select(s => new LibraryShelfItemDto(
                s.Id, "savedbook", s.Title, s.Author, s.CoverPath, s.Slug, s.Language,
                1.0, s.FinishedAt, s.CreatedAt, null)))
            .OrderByDescending(i => i.LastOpenedAt ?? DateTimeOffset.MinValue)
            .Take(ShelfLimit)
            .ToList();
    }

    /// <summary>Resolved book-percent for a book, or the raw chapter-percent
    /// fallback when we couldn't compute one (book with no chapters loaded).</summary>
    private static double BookPct(IReadOnlyDictionary<Guid, double> map, Guid id, double fallback)
        => map.TryGetValue(id, out var p) ? p : Math.Clamp(fallback, 0.0, 1.0);

    /// <summary>Batch chapter-%→book-% for editions. One query for all chapters
    /// of the candidate editions. Current chapter located by the slug in the
    /// progress Locator (accurate even when the user infinite-scrolled past the
    /// chapter they opened — the URL chapter / ChapterId lags the live slug),
    /// falling back to ChapterId for legacy/non-JSON locators.</summary>
    private async Task<Dictionary<Guid, double>> ComputeEditionBookPercentsAsync(
        IReadOnlyCollection<(Guid EditionId, Guid? ChapterId, string? Locator, double ChapterPercent)> rows, CancellationToken ct)
    {
        var result = new Dictionary<Guid, double>();
        if (rows.Count == 0) return result;

        var editionIds = rows.Select(r => r.EditionId).Distinct().ToList();
        var chapters = await db.Chapters
            .Where(c => editionIds.Contains(c.EditionId))
            .Select(c => new { c.Id, c.EditionId, c.ChapterNumber, c.Slug, c.WordCount })
            .ToListAsync(ct);
        var byEdition = chapters
            .GroupBy(c => c.EditionId)
            .ToDictionary(g => g.Key, g => g.OrderBy(c => c.ChapterNumber).ToList());

        foreach (var r in rows)
        {
            if (result.ContainsKey(r.EditionId)) continue;
            if (!byEdition.TryGetValue(r.EditionId, out var ordered) || ordered.Count == 0)
            {
                result[r.EditionId] = Math.Clamp(r.ChapterPercent, 0.0, 1.0);
                continue;
            }
            var slug = ExtractLocatorSlug(r.Locator);
            var idx = slug != null ? ordered.FindIndex(c => c.Slug == slug) : -1;
            if (idx < 0 && r.ChapterId is { } cid) idx = ordered.FindIndex(c => c.Id == cid);
            var words = ordered.Select(c => c.WordCount ?? 0).ToList();
            result[r.EditionId] = BookProgressCalculator.Compute(words, idx, r.ChapterPercent);
        }
        return result;
    }

    /// <summary>Pull the chapter slug out of a reading-progress locator. Editions
    /// store JSON <c>{"type":"chapter","slug":"…"}</c>; returns null for missing
    /// or non-JSON locators (caller falls back to ChapterId).</summary>
    private static string? ExtractLocatorSlug(string? locator)
    {
        if (string.IsNullOrWhiteSpace(locator) || locator[0] != '{') return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(locator);
            return doc.RootElement.TryGetProperty("slug", out var s) && s.ValueKind == System.Text.Json.JsonValueKind.String
                ? s.GetString()
                : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Batch chapter-%→book-% for user-uploaded books. Current chapter
    /// located by slug; falls back to the synthesized "chapter-{n}" form the
    /// reader uses when a user-chapter has no stored slug.</summary>
    private async Task<Dictionary<Guid, double>> ComputeUserBookPercentsAsync(
        IReadOnlyCollection<(Guid BookId, string? Slug, double ChapterPercent)> rows, CancellationToken ct)
    {
        var result = new Dictionary<Guid, double>();
        if (rows.Count == 0) return result;

        var bookIds = rows.Select(r => r.BookId).Distinct().ToList();
        var chapters = await db.UserChapters
            .Where(c => bookIds.Contains(c.UserBookId))
            .Select(c => new { c.UserBookId, c.ChapterNumber, c.Slug, c.WordCount })
            .ToListAsync(ct);
        var byBook = chapters
            .GroupBy(c => c.UserBookId)
            .ToDictionary(g => g.Key, g => g.OrderBy(c => c.ChapterNumber).ToList());

        foreach (var r in rows)
        {
            if (result.ContainsKey(r.BookId)) continue;
            if (!byBook.TryGetValue(r.BookId, out var ordered) || ordered.Count == 0)
            {
                result[r.BookId] = Math.Clamp(r.ChapterPercent, 0.0, 1.0);
                continue;
            }
            var idx = r.Slug != null ? ordered.FindIndex(c => c.Slug == r.Slug) : -1;
            if (idx < 0 && r.Slug != null && r.Slug.StartsWith("chapter-")
                && int.TryParse(r.Slug.AsSpan("chapter-".Length), out var n))
                idx = ordered.FindIndex(c => c.ChapterNumber == n);
            var words = ordered.Select(c => c.WordCount ?? 0).ToList();
            result[r.BookId] = BookProgressCalculator.Compute(words, idx, r.ChapterPercent);
        }
        return result;
    }

    public static int? EstimateRemaining(int? totalWords, double progress, decimal pace)
    {
        if (pace < MinSanePace) return null;
        if (totalWords is null or <= 0) return null;
        var clampedProgress = Math.Clamp(progress, 0.0, 1.0);
        var wordsLeft = (decimal)(totalWords.Value * (1 - clampedProgress));
        if (wordsLeft <= 0) return 0;
        return (int)Math.Ceiling(wordsLeft / pace);
    }
}
