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
                .Select(p => new { p.Percent, p.UpdatedAt })
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
                LastOpened = (DateTimeOffset?)latestProgress.UpdatedAt,
                ul.CreatedAt,
                TotalWordCount = (int?)db.Chapters
                    .Where(c => c.EditionId == e.Id)
                    .Sum(c => (int?)c.WordCount ?? 0)
            };

        var saved = await savedQuery.Take(ShelfLimit * 2).ToListAsync(ct);

        var merged = uploads
            .Select(u => new LibraryShelfItemDto(
                u.Id, "userbook", u.Title, u.Author, u.CoverPath, u.Slug, u.Language,
                u.Progress, u.LastOpened, u.CreatedAt,
                EstimateRemaining(u.TotalWordCount, u.Progress, pace)))
            .Concat(saved.Select(s => new LibraryShelfItemDto(
                s.Id, "savedbook", s.Title, s.Author, s.CoverPath, s.Slug, s.Language,
                s.Progress, s.LastOpened, s.CreatedAt,
                EstimateRemaining(s.TotalWordCount, s.Progress, pace))))
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
                LatestProgress = (double?)db.ReadingProgresses
                    .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                    .OrderByDescending(p => p.UpdatedAt)
                    .Select(p => p.Percent)
                    .FirstOrDefault(),
                LastOpened = (DateTimeOffset?)db.ReadingProgresses
                    .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                    .OrderByDescending(p => p.UpdatedAt)
                    .Select(p => (DateTimeOffset?)p.UpdatedAt)
                    .FirstOrDefault(),
                TotalWordCount = (int?)db.Chapters
                    .Where(c => c.EditionId == e.Id)
                    .Sum(c => (int?)c.WordCount ?? 0)
            }).Take(ShelfLimit * 2).ToListAsync(ct);

        return uploads
            .Select(u => new LibraryShelfItemDto(
                u.Id, "userbook", u.Title, u.Author, u.CoverPath, u.Slug, u.Language,
                u.Progress, u.LastOpened, u.CreatedAt,
                EstimateRemaining(u.TotalWordCount, u.Progress, pace)))
            .Concat(saved.Select(s => new LibraryShelfItemDto(
                s.Id, "savedbook", s.Title, s.Author, s.CoverPath, s.Slug, s.Language,
                s.LatestProgress ?? 0, s.LastOpened, s.CreatedAt,
                EstimateRemaining(s.TotalWordCount, s.LatestProgress ?? 0, pace))))
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
            let latestPercent = db.ReadingProgresses
                .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => (double?)p.Percent)
                .FirstOrDefault()
            where totalWords > 0 && (latestPercent ?? 0) < InProgressMaxPercent
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
                Progress = latestPercent ?? 0,
                LastOpened = (DateTimeOffset?)db.ReadingProgresses
                    .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == e.Id)
                    .OrderByDescending(p => p.UpdatedAt)
                    .Select(p => (DateTimeOffset?)p.UpdatedAt)
                    .FirstOrDefault(),
                ul.CreatedAt,
                TotalWordCount = (int?)totalWords
            }).Take(ShelfLimit * 4).ToListAsync(ct);

        bool IsQuick(int? words, double progress)
        {
            if (words is null or <= 0) return false;
            var remaining = EstimateRemaining(words, progress, pace);
            return remaining is > 0 and <= QuickReadMaxMinutes;
        }

        return uploads
            .Where(u => IsQuick(u.TotalWordCount, u.Progress))
            .Select(u => new LibraryShelfItemDto(
                u.Id, "userbook", u.Title, u.Author, u.CoverPath, u.Slug, u.Language,
                u.Progress, u.LastOpened, u.CreatedAt,
                EstimateRemaining(u.TotalWordCount, u.Progress, pace)))
            .Concat(saved
                .Where(s => IsQuick(s.TotalWordCount, s.Progress))
                .Select(s => new LibraryShelfItemDto(
                    s.Id, "savedbook", s.Title, s.Author, s.CoverPath, s.Slug, s.Language,
                    s.Progress, s.LastOpened, s.CreatedAt,
                    EstimateRemaining(s.TotalWordCount, s.Progress, pace))))
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
