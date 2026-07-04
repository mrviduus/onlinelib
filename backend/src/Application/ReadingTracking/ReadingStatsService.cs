using Application.Common.Interfaces;
using Contracts.ReadingTracking;
using Microsoft.EntityFrameworkCore;

namespace Application.ReadingTracking;

/// <summary>
/// Read-only reading-statistics aggregations (R5). Behaviour is moved verbatim from the former
/// <c>ReadingTrackingEndpoints.GetBookStats</c> handler — the 6 <c>.ToListAsync()</c> materialization
/// boundaries and every in-memory aggregation are preserved byte-for-byte so the JSON response is
/// identical. Site scope is enforced by the R1b EF query filter (no explicit SiteId here).
/// </summary>
public class ReadingStatsService(IAppDbContext db)
{
    public async Task<BookStatsResponse> GetBookStatsAsync(Guid userId, int? year, CancellationToken ct)
    {
        // 1. Find finished editions: first session where EndPercent >= 0.99 per edition
        var finishEvents = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.EditionId != null && s.EndPercent >= 0.99)
            .GroupBy(s => s.EditionId!.Value)
            .Select(g => new { EditionId = g.Key, FinishedAt = g.Min(s => s.EndedAt) })
            .ToListAsync(ct);

        // Also find finished user books (with metadata for breakdowns)
        var userBookFinishEvents = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.UserBookId != null && s.EndPercent >= 0.99)
            .GroupBy(s => s.UserBookId!.Value)
            .Select(g => new { UserBookId = g.Key, FinishedAt = g.Min(s => s.EndedAt) })
            .ToListAsync(ct);

        // Available years (both editions and user books)
        var availableYears = finishEvents.Select(f => f.FinishedAt.Year)
            .Concat(userBookFinishEvents.Select(f => f.FinishedAt.Year))
            .Distinct()
            .OrderDescending()
            .ToList();

        // 2. Year filter
        if (year.HasValue && year.Value > 0)
        {
            finishEvents = finishEvents.Where(f => f.FinishedAt.Year == year.Value).ToList();
            userBookFinishEvents = userBookFinishEvents.Where(f => f.FinishedAt.Year == year.Value).ToList();
        }

        var editionIds = finishEvents.Select(f => f.EditionId).ToList();
        var finishMap = finishEvents.ToDictionary(f => f.EditionId, f => f.FinishedAt);
        var userBookIds = userBookFinishEvents.Select(f => f.UserBookId).ToList();
        var userBookFinishMap = userBookFinishEvents.ToDictionary(f => f.UserBookId, f => f.FinishedAt);

        // 3. Load edition metadata
        var editions = await db.Editions
            .Where(e => editionIds.Contains(e.Id))
            .Select(e => new
            {
                e.Id,
                e.Language,
                WordCount = e.Chapters.Sum(c => (int?)c.WordCount) ?? 0,
                Genres = e.Genres.Select(g => new { g.Name, g.Slug }).ToList(),
                Authors = e.EditionAuthors
                    .Where(ea => ea.Role == Domain.Enums.AuthorRole.Author)
                    .OrderBy(ea => ea.Order)
                    .Select(ea => new { ea.Author.Name, ea.Author.Slug })
                    .ToList(),
            })
            .ToListAsync(ct);

        // 3b. Load finished user book metadata
        var userBooks = userBookIds.Count > 0
            ? await db.UserBooks
                .Where(b => userBookIds.Contains(b.Id))
                .Select(b => new { b.Id, b.Language, b.Genre, b.Author, b.TotalWordCount })
                .ToListAsync(ct)
            : [];

        // 4. First session per edition (for avg days to finish)
        var firstSessions = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.EditionId != null && editionIds.Contains(s.EditionId!.Value))
            .GroupBy(s => s.EditionId!.Value)
            .Select(g => new { EditionId = g.Key, FirstStarted = g.Min(s => s.StartedAt) })
            .ToListAsync(ct);
        var firstSessionMap = firstSessions.ToDictionary(f => f.EditionId, f => f.FirstStarted);

        // 5. Reading time per edition (for pace + time-by-genre/author)
        var sessionsByEdition = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.EditionId != null && editionIds.Contains(s.EditionId!.Value))
            .GroupBy(s => s.EditionId!.Value)
            .Select(g => new { EditionId = g.Key, TotalSeconds = g.Sum(s => s.DurationSeconds), TotalWords = g.Sum(s => s.WordsRead) })
            .ToListAsync(ct);
        var sessionMap = sessionsByEdition.ToDictionary(s => s.EditionId);

        // --- Aggregations ---
        var userBookPages = userBooks.Sum(b => (b.TotalWordCount ?? 0)) / 250;
        var totalPages = editions.Sum(e => e.WordCount) / 250 + userBookPages;

        // Avg days to finish
        var daysToFinish = editions
            .Where(e => finishMap.ContainsKey(e.Id) && firstSessionMap.ContainsKey(e.Id))
            .Select(e => (finishMap[e.Id] - firstSessionMap[e.Id]).TotalDays)
            .ToList();
        var avgDaysToFinish = daysToFinish.Count > 0 ? Math.Round(daysToFinish.Average(), 1) : 0;

        // Genre stats (editions + user books with genre)
        var genreItems = editions
            .SelectMany(e => e.Genres.Select(g => new { g.Name, g.Slug }))
            .Concat(userBooks
                .Where(b => !string.IsNullOrEmpty(b.Genre))
                .Select(b => new { Name = b.Genre!, Slug = b.Genre!.ToLowerInvariant().Replace(' ', '-') }));
        var genreStats = genreItems
            .GroupBy(g => g.Slug)
            .Select(g => new GenreStatDto(g.First().Name, g.Key, g.Count()))
            .OrderByDescending(g => g.Count)
            .ToList();

        // Author stats (editions + user books with author)
        var authorItems = editions
            .SelectMany(e => e.Authors.Select(a => new { a.Name, a.Slug }))
            .Concat(userBooks
                .Where(b => !string.IsNullOrEmpty(b.Author))
                .Select(b => new { Name = b.Author!, Slug = b.Author!.ToLowerInvariant().Replace(' ', '-') }));
        var authorStats = authorItems
            .GroupBy(a => a.Slug)
            .Select(g => new AuthorStatDto(g.First().Name, g.Key, g.Count()))
            .OrderByDescending(a => a.Count)
            .Take(10)
            .ToList();

        // Language stats (editions + user books)
        var languageItems = editions.Select(e => e.Language)
            .Concat(userBooks.Select(b => b.Language));
        var languageStats = languageItems
            .GroupBy(l => l)
            .Select(g => new LanguageStatDto(g.Key, g.Count()))
            .OrderByDescending(l => l.Count)
            .ToList();

        // Books over time (editions + user books)
        var allFinishEvents = finishEvents
            .Select(f => new { f.FinishedAt, EditionId = (Guid?)f.EditionId, UserBookId = (Guid?)null })
            .Concat(userBookFinishEvents
                .Select(f => new { f.FinishedAt, EditionId = (Guid?)null, UserBookId = (Guid?)f.UserBookId }));
        var booksOverTime = allFinishEvents
            .GroupBy(f => year.HasValue && year.Value > 0
                ? f.FinishedAt.ToString("yyyy-MM")
                : f.FinishedAt.Year.ToString())
            .Select(g =>
            {
                var eIds = g.Where(f => f.EditionId != null).Select(f => f.EditionId!.Value).ToHashSet();
                var ubIds = g.Where(f => f.UserBookId != null).Select(f => f.UserBookId!.Value).ToHashSet();
                var pages = editions.Where(e => eIds.Contains(e.Id)).Sum(e => e.WordCount) / 250
                          + userBooks.Where(b => ubIds.Contains(b.Id)).Sum(b => (b.TotalWordCount ?? 0)) / 250;
                return new BooksOverTimeDto(g.Key, g.Count(), pages);
            })
            .OrderBy(b => b.Period)
            .ToList();

        // Book length distribution (editions + user books)
        var lengthPages = editions.Select(e => e.WordCount / 250)
            .Concat(userBooks.Where(b => b.TotalWordCount > 0).Select(b => b.TotalWordCount!.Value / 250));
        var lengthBuckets = lengthPages
            .GroupBy(p => p < 150 ? "short" : p < 400 ? "medium" : "long")
            .Select(g => new BookLengthBucketDto(g.Key, g.Count()))
            .ToList();

        // Pace stats (auto-calc: seconds per word → slow/medium/fast)
        var paceList = editions
            .Where(e => sessionMap.ContainsKey(e.Id) && e.WordCount > 0)
            .Select(e =>
            {
                var wpm = sessionMap[e.Id].TotalWords / Math.Max(1.0, sessionMap[e.Id].TotalSeconds / 60.0);
                return wpm < 150 ? "slow" : wpm < 300 ? "medium" : "fast";
            })
            .GroupBy(p => p)
            .Select(g => new PaceStatDto(g.Key, g.Count()))
            .ToList();

        // Reading time by genre
        var timeByGenre = editions
            .Where(e => sessionMap.ContainsKey(e.Id))
            .SelectMany(e => e.Genres.Select(g => new { g.Name, g.Slug, sessionMap[e.Id].TotalSeconds }))
            .GroupBy(x => x.Slug)
            .Select(g => new ReadingTimeStatDto(g.First().Name, g.Key, g.Sum(x => x.TotalSeconds)))
            .OrderByDescending(x => x.Seconds)
            .ToList();

        // Reading time by author
        var timeByAuthor = editions
            .Where(e => sessionMap.ContainsKey(e.Id))
            .SelectMany(e => e.Authors.Select(a => new { a.Name, a.Slug, sessionMap[e.Id].TotalSeconds }))
            .GroupBy(x => x.Slug)
            .Select(g => new ReadingTimeStatDto(g.First().Name, g.Key, g.Sum(x => x.TotalSeconds)))
            .OrderByDescending(x => x.Seconds)
            .Take(10)
            .ToList();

        return new BookStatsResponse(
            BooksFinished: editionIds.Count + userBookIds.Count,
            TotalPages: totalPages,
            AvgDaysToFinish: avgDaysToFinish,
            GenreStats: genreStats,
            AuthorStats: authorStats,
            LanguageStats: languageStats,
            BooksOverTime: booksOverTime,
            BookLengthDistribution: lengthBuckets,
            PaceStats: paceList,
            ReadingTimeByGenre: timeByGenre,
            ReadingTimeByAuthor: timeByAuthor,
            AvailableYears: availableYears
        );
    }
}
