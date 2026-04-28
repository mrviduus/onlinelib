using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.UserBooks;

public class BookStatsService(IAppDbContext db)
{
    private const decimal MinSanePace = 50m;
    private const int FallbackPaceSessionThreshold = 3;

    public async Task<BookStatsResult?> GetStatsAsync(Guid userId, Guid userBookId, CancellationToken ct)
    {
        var book = await db.UserBooks
            .Where(b => b.Id == userBookId && b.UserId == userId)
            .Select(b => new { b.Id, b.TotalWordCount, b.ProgressPercent })
            .FirstOrDefaultAsync(ct);
        if (book is null) return null;

        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.UserBookId == userBookId)
            .Select(s => new { s.DurationSeconds, s.WordsRead })
            .ToListAsync(ct);

        var sessionsCount = sessions.Count;
        var totalSeconds = sessions.Sum(s => (long)s.DurationSeconds);
        var totalMinutes = totalSeconds / 60;
        var wordsRead = sessions.Sum(s => s.WordsRead);

        var vocabCount = await db.VocabularyWords
            .CountAsync(v => v.UserId == userId && v.UserBookId == userBookId, ct);
        var highlightsCount = await db.Highlights
            .CountAsync(h => h.UserId == userId && h.UserBookId == userBookId, ct);

        decimal pace;
        if (sessionsCount >= FallbackPaceSessionThreshold && totalMinutes > 0)
        {
            pace = (decimal)wordsRead / totalMinutes;
        }
        else
        {
            var allUserSessions = await db.ReadingSessions
                .Where(s => s.UserId == userId && s.DurationSeconds > 0)
                .Select(s => new { s.DurationSeconds, s.WordsRead })
                .ToListAsync(ct);
            var allMinutes = allUserSessions.Sum(s => (long)s.DurationSeconds) / 60m;
            var allWords = allUserSessions.Sum(s => s.WordsRead);
            pace = allMinutes > 0 ? allWords / allMinutes : 0m;
        }

        int? estimatedRemaining = null;
        if (book.TotalWordCount.HasValue && book.TotalWordCount.Value > 0 && pace >= MinSanePace)
        {
            var progress = book.ProgressPercent ?? 0;
            var wordsLeft = book.TotalWordCount.Value * (1 - progress);
            if (wordsLeft > 0) estimatedRemaining = (int)Math.Ceiling((decimal)wordsLeft / pace);
        }

        return new BookStatsResult(
            BookId: book.Id,
            SessionsCount: sessionsCount,
            TotalReadMinutes: totalMinutes,
            WordsRead: wordsRead,
            VocabSavedCount: vocabCount,
            HighlightsCount: highlightsCount,
            AverageWordsPerMinute: Math.Round(pace, 1),
            EstimatedMinutesRemaining: estimatedRemaining
        );
    }
}

public record BookStatsResult(
    Guid BookId,
    int SessionsCount,
    long TotalReadMinutes,
    int WordsRead,
    int VocabSavedCount,
    int HighlightsCount,
    decimal AverageWordsPerMinute,
    int? EstimatedMinutesRemaining
);
