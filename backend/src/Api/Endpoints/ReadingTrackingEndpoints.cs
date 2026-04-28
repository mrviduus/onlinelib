using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Application.ReadingTracking;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Endpoints;

public static class ReadingTrackingEndpoints
{
    public static void MapReadingTrackingEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/reading").WithTags("Reading Tracking");

        group.MapPost("/sessions", SubmitSession).WithName("SubmitReadingSession");
        group.MapGet("/sessions", GetSessions).WithName("GetReadingSessions");
        group.MapGet("/stats", GetStats).WithName("GetReadingStats");
        group.MapGet("/stats/daily", GetDailyStats).WithName("GetDailyReadingStats");
        group.MapGet("/goals", GetGoals).WithName("GetReadingGoals");
        group.MapPost("/goals", CreateOrUpdateGoal).WithName("CreateOrUpdateReadingGoal");
        group.MapDelete("/goals/{id:guid}", DeleteGoal).WithName("DeleteReadingGoal");
        group.MapGet("/achievements", GetAchievements).WithName("GetAchievements");
        group.MapGet("/book-stats", GetBookStats).WithName("GetBookStats");
        group.MapGet("/pace", GetPace).WithName("GetReadingPace");
        group.MapGet("/library-summary", GetLibrarySummary).WithName("GetLibrarySummary");
    }

    // --- Library Summary (slice 20) ---

    private static async Task<IResult> GetLibrarySummary(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IMemoryCache cache,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var cacheKey = $"library-summary:{userId.Value}:{siteId}:{tz ?? "0"}";
        if (cache.TryGetValue<LibrarySummaryDto>(cacheKey, out var cached) && cached != null)
            return Results.Ok(cached);

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;
        var todayLocal = GetDayStart(now, tzOffset);
        var monthStart = new DateTimeOffset(todayLocal.Year, todayLocal.Month, 1, 0, 0, 0, tzOffset).ToUniversalTime();
        var yearStart = new DateTimeOffset(todayLocal.Year, 1, 1, 0, 0, 0, tzOffset).ToUniversalTime();

        var monthAgg = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.StartedAt >= monthStart)
            .GroupBy(_ => 1)
            .Select(g => new { Words = g.Sum(s => (long)s.WordsRead), Seconds = g.Sum(s => (long)s.DurationSeconds) })
            .FirstOrDefaultAsync(ct);

        var pagesThisMonth = (int)((monthAgg?.Words ?? 0) / 250);
        var minutesThisMonth = (int)((monthAgg?.Seconds ?? 0) / 60);

        var streakMinMinutes = await GetStreakMinMinutes(db, userId.Value, siteId, ct);
        var currentStreak = await CalculateStreak(db, userId.Value, siteId, streakMinMinutes, now, ct, tzOffset);

        var booksFinishedYtd = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.EndPercent >= 0.99 && s.EndedAt >= yearStart)
            .Select(s => s.EditionId ?? s.UserBookId)
            .Distinct()
            .CountAsync(ct);

        var dailyGoal = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.SiteId == siteId && g.GoalType == "daily_minutes" && g.IsActive)
            .Select(g => new { g.TargetValue, g.StreakMinMinutes })
            .FirstOrDefaultAsync(ct);
        var yearlyGoal = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.SiteId == siteId && g.GoalType == "books_per_year" && g.IsActive)
            .Select(g => new { g.TargetValue, g.Year })
            .FirstOrDefaultAsync(ct);

        GoalSummaryDto? goal = null;
        if (dailyGoal != null)
        {
            var todayStart = todayLocal.ToUniversalTime();
            var todaySeconds = await db.ReadingSessions
                .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.StartedAt >= todayStart)
                .SumAsync(s => (long)s.DurationSeconds, ct);
            goal = new GoalSummaryDto("daily_minutes", (int)(todaySeconds / 60), dailyGoal.TargetValue);
        }
        else if (yearlyGoal != null)
        {
            goal = new GoalSummaryDto("books_per_year", booksFinishedYtd, yearlyGoal.TargetValue);
        }

        var dto = new LibrarySummaryDto(
            PagesThisMonth: pagesThisMonth,
            MinutesThisMonth: minutesThisMonth,
            CurrentStreak: currentStreak,
            StreakMinMinutes: streakMinMinutes,
            BooksFinishedYtd: booksFinishedYtd,
            Goal: goal
        );

        cache.Set(cacheKey, dto, TimeSpan.FromMinutes(5));
        return Results.Ok(dto);
    }

    // --- Reading Pace (slice 19) ---

    private const int PaceMinSessions = 3;
    private const int FallbackPaceWpm = 200;

    private static async Task<IResult> GetPace(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IMemoryCache cache,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var cacheKey = $"reading-pace:{userId.Value}:{siteId}";
        if (cache.TryGetValue<ReadingPaceDto>(cacheKey, out var cached) && cached != null)
            return Results.Ok(cached);

        var agg = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.WordsRead > 0 && s.DurationSeconds > 0)
            .GroupBy(_ => 1)
            .Select(g => new { Sessions = g.Count(), Words = g.Sum(s => (long)s.WordsRead), Seconds = g.Sum(s => (long)s.DurationSeconds) })
            .FirstOrDefaultAsync(ct);

        ReadingPaceDto dto;
        if (agg == null || agg.Sessions < PaceMinSessions || agg.Seconds <= 0)
        {
            dto = new ReadingPaceDto(FallbackPaceWpm, agg?.Sessions ?? 0, false);
        }
        else
        {
            var wpm = (int)Math.Round(agg.Words / (agg.Seconds / 60.0));
            // Clamp to sane range — guards against ultra-short sessions skewing avg
            wpm = Math.Clamp(wpm, 50, 800);
            dto = new ReadingPaceDto(wpm, agg.Sessions, true);
        }

        cache.Set(cacheKey, dto, TimeSpan.FromHours(1));
        return Results.Ok(dto);
    }

    // --- Sessions ---

    private static async Task<IResult> SubmitSession(
        [FromBody] SubmitSessionRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        // Validation
        if (request.EditionId == null && request.UserBookId == null)
            return Results.BadRequest("EditionId or UserBookId required");
        if (request.DurationSeconds <= 0 || request.DurationSeconds > 14400)
            return Results.BadRequest("DurationSeconds must be 1-14400");
        if (request.StartedAt > DateTimeOffset.UtcNow.AddMinutes(5))
            return Results.BadRequest("StartedAt cannot be in the future");
        if (request.StartedAt < DateTimeOffset.UtcNow.AddDays(-7))
            return Results.BadRequest("StartedAt cannot be older than 7 days");
        var elapsed = (request.EndedAt - request.StartedAt).TotalSeconds;
        if (elapsed < request.DurationSeconds)
            return Results.BadRequest("EndedAt - StartedAt must be >= DurationSeconds");

        var session = new ReadingSession
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            SiteId = siteId,
            EditionId = request.EditionId,
            UserBookId = request.UserBookId,
            StartedAt = request.StartedAt,
            EndedAt = request.EndedAt,
            DurationSeconds = request.DurationSeconds,
            WordsRead = request.WordsRead,
            StartPercent = request.StartPercent,
            EndPercent = request.EndPercent,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.ReadingSessions.Add(session);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        {
            // Unique constraint violation (duplicate) — ignore
            return Results.Ok(new SubmitSessionResponse(session.Id, []));
        }

        // Achievement check is best-effort — never fail the session submit because of it.
        List<string> newAchievements = [];
        try
        {
            var streakMinMinutes = await GetStreakMinMinutes(db, userId.Value, siteId, ct);
            var currentStreak = await CalculateStreak(db, userId.Value, siteId, streakMinMinutes, request.EndedAt, ct);

            var checker = new AchievementChecker(db);
            newAchievements = await checker.CheckAfterSession(userId.Value, siteId, session, currentStreak, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AchievementChecker failed for session {SessionId}, session still saved", session.Id);
        }

        return Results.Ok(new SubmitSessionResponse(session.Id, newAchievements));
    }

    private static async Task<IResult> GetSessions(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] int? limit,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var query = db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId);

        if (from.HasValue) query = query.Where(s => s.StartedAt >= from.Value);
        if (to.HasValue) query = query.Where(s => s.StartedAt <= to.Value);

        var sessions = await query
            .OrderByDescending(s => s.StartedAt)
            .Take(limit ?? 100)
            .Select(s => new SessionDto(
                s.Id, s.EditionId, s.UserBookId,
                s.StartedAt, s.EndedAt, s.DurationSeconds,
                s.WordsRead, s.StartPercent, s.EndPercent))
            .ToListAsync(ct);

        return Results.Ok(sessions);
    }

    // --- Stats ---

    private static async Task<IResult> GetStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;

        var allSessions = db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId);

        var totalSeconds = await allSessions.SumAsync(s => (long)s.DurationSeconds, ct);
        var totalWords = await allSessions.SumAsync(s => (long)s.WordsRead, ct);
        var sessionCount = await allSessions.CountAsync(ct);

        var booksFinished = await allSessions
            .Where(s => s.EndPercent >= 0.99)
            .Select(s => s.EditionId ?? s.UserBookId)
            .Distinct()
            .CountAsync(ct);

        // Time-period sums (calculate in user tz, convert to UTC for PostgreSQL)
        var todayLocal = GetDayStart(now, tzOffset);
        var todayStart = todayLocal.ToUniversalTime();
        var weekStart = todayLocal.AddDays(-(int)todayLocal.DayOfWeek).ToUniversalTime();
        var monthStart = new DateTimeOffset(todayLocal.Year, todayLocal.Month, 1, 0, 0, 0, tzOffset).ToUniversalTime();

        var todaySeconds = await allSessions
            .Where(s => s.StartedAt >= todayStart)
            .SumAsync(s => (long)s.DurationSeconds, ct);
        var weekSeconds = await allSessions
            .Where(s => s.StartedAt >= weekStart)
            .SumAsync(s => (long)s.DurationSeconds, ct);
        var monthSeconds = await allSessions
            .Where(s => s.StartedAt >= monthStart)
            .SumAsync(s => (long)s.DurationSeconds, ct);

        // Streak
        var streakMinMinutes = await GetStreakMinMinutes(db, userId.Value, siteId, ct);
        var currentStreak = await CalculateStreak(db, userId.Value, siteId, streakMinMinutes, now, ct, tzOffset);
        var longestStreak = await CalculateLongestStreak(db, userId.Value, siteId, streakMinMinutes, ct, tzOffset);

        // Averages
        double avgDailyMinutes = 0;
        double avgWordsPerMinute = 0;
        if (sessionCount > 0)
        {
            var firstSession = await allSessions
                .OrderBy(s => s.StartedAt)
                .Select(s => s.StartedAt)
                .FirstOrDefaultAsync(ct);
            var daysSinceFirst = Math.Max(1, (now - firstSession).TotalDays);
            avgDailyMinutes = totalSeconds / 60.0 / daysSinceFirst;

            if (totalSeconds > 0)
                avgWordsPerMinute = totalWords / (totalSeconds / 60.0);
        }

        // Vocab reviews today
        var todayVocabReviews = await db.VocabularyReviews
            .Where(r => r.UserId == userId.Value && r.SiteId == siteId && r.CreatedAt >= todayStart)
            .CountAsync(ct);

        // Daily goal (reading + vocab reviews as effective minutes)
        var dailyGoal = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.SiteId == siteId
                && g.GoalType == "daily_minutes" && g.IsActive)
            .FirstOrDefaultAsync(ct);

        object? dailyGoalObj = null;
        if (dailyGoal != null)
        {
            var effectiveTodayMinutes = todaySeconds / 60.0 + todayVocabReviews * 0.5;
            dailyGoalObj = new
            {
                target = dailyGoal.TargetValue,
                today = Math.Round(effectiveTodayMinutes, 1),
                met = effectiveTodayMinutes >= dailyGoal.TargetValue,
            };
        }

        return Results.Ok(new
        {
            totalSeconds,
            totalWords,
            booksFinished,
            currentStreak,
            longestStreak,
            streakMinMinutes,
            avgDailyMinutes = Math.Round(avgDailyMinutes, 1),
            avgWordsPerMinute = Math.Round(avgWordsPerMinute, 1),
            todaySeconds,
            todayVocabReviews,
            weekSeconds,
            monthSeconds,
            dailyGoal = dailyGoalObj,
        });
    }

    private static async Task<IResult> GetDailyStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;
        var start = from ?? now.AddDays(-90);
        var end = to ?? now;

        // Get raw sessions in range
        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId
                && s.StartedAt >= start && s.StartedAt <= end)
            .Select(s => new { s.StartedAt, s.DurationSeconds, s.WordsRead })
            .ToListAsync(ct);

        // Group by local date
        var daily = sessions
            .GroupBy(s => s.StartedAt.ToOffset(tzOffset).Date)
            .Select(g => new DailyStatDto(
                g.Key,
                g.Sum(s => s.DurationSeconds),
                g.Sum(s => s.WordsRead),
                g.Count()))
            .OrderBy(d => d.Date)
            .ToList();

        return Results.Ok(daily);
    }

    // --- Goals ---

    private static async Task<IResult> GetGoals(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var goals = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.SiteId == siteId && g.IsActive)
            .Select(g => new GoalDto(g.Id, g.GoalType, g.TargetValue, g.Year, g.StreakMinMinutes, g.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(goals);
    }

    private static async Task<IResult> CreateOrUpdateGoal(
        [FromBody] CreateGoalRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (request.GoalType != "daily_minutes" && request.GoalType != "books_per_year")
            return Results.BadRequest("GoalType must be daily_minutes or books_per_year");
        if (request.TargetValue <= 0)
            return Results.BadRequest("TargetValue must be positive");

        var existing = await db.ReadingGoals
            .FirstOrDefaultAsync(g => g.UserId == userId.Value && g.SiteId == siteId
                && g.GoalType == request.GoalType, ct);

        if (existing != null)
        {
            existing.TargetValue = request.TargetValue;
            existing.Year = request.Year;
            existing.IsActive = true;
            if (request.StreakMinMinutes.HasValue)
                existing.StreakMinMinutes = request.StreakMinMinutes.Value;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            existing = new ReadingGoal
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                GoalType = request.GoalType,
                TargetValue = request.TargetValue,
                Year = request.Year,
                IsActive = true,
                StreakMinMinutes = request.StreakMinMinutes ?? 5,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.ReadingGoals.Add(existing);
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(new GoalDto(existing.Id, existing.GoalType, existing.TargetValue,
            existing.Year, existing.StreakMinMinutes, existing.UpdatedAt));
    }

    private static async Task<IResult> DeleteGoal(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var goal = await db.ReadingGoals
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId.Value, ct);
        if (goal == null) return Results.NotFound();

        db.ReadingGoals.Remove(goal);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // --- Achievements ---

    private static async Task<IResult> GetAchievements(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var unlocked = await db.UserAchievements
            .Where(a => a.UserId == userId.Value && a.SiteId == siteId)
            .Select(a => new AchievementDto(a.AchievementCode, a.UnlockedAt))
            .ToListAsync(ct);

        return Results.Ok(unlocked);
    }

    // --- Book Stats ---

    private static async Task<IResult> GetBookStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int? year,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        // 1. Find finished editions: first session where EndPercent >= 0.99 per edition
        var finishEvents = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.EditionId != null && s.EndPercent >= 0.99)
            .GroupBy(s => s.EditionId!.Value)
            .Select(g => new { EditionId = g.Key, FinishedAt = g.Min(s => s.EndedAt) })
            .ToListAsync(ct);

        // Also find finished user books (with metadata for breakdowns)
        var userBookFinishEvents = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.UserBookId != null && s.EndPercent >= 0.99)
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
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.EditionId != null && editionIds.Contains(s.EditionId!.Value))
            .GroupBy(s => s.EditionId!.Value)
            .Select(g => new { EditionId = g.Key, FirstStarted = g.Min(s => s.StartedAt) })
            .ToListAsync(ct);
        var firstSessionMap = firstSessions.ToDictionary(f => f.EditionId, f => f.FirstStarted);

        // 5. Reading time per edition (for pace + time-by-genre/author)
        var sessionsByEdition = await db.ReadingSessions
            .Where(s => s.UserId == userId.Value && s.SiteId == siteId && s.EditionId != null && editionIds.Contains(s.EditionId!.Value))
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

        return Results.Ok(new BookStatsResponse(
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
        ));
    }

    // --- Helpers ---

    private static TimeSpan ParseTzOffset(string? tz)
    {
        if (string.IsNullOrEmpty(tz)) return TimeSpan.Zero;
        if (int.TryParse(tz, out var minutes))
            return TimeSpan.FromMinutes(minutes);
        return TimeSpan.Zero;
    }

    private static DateTimeOffset GetDayStart(DateTimeOffset now, TimeSpan tzOffset)
    {
        var local = now.ToOffset(tzOffset);
        return new DateTimeOffset(local.Year, local.Month, local.Day, 0, 0, 0, tzOffset);
    }

    internal static async Task<int> GetStreakMinMinutes(IAppDbContext db, Guid userId, Guid siteId, CancellationToken ct)
    {
        var goal = await db.ReadingGoals
            .Where(g => g.UserId == userId && g.SiteId == siteId && g.GoalType == "daily_minutes" && g.IsActive)
            .Select(g => (int?)g.StreakMinMinutes)
            .FirstOrDefaultAsync(ct);
        return goal ?? 5;
    }

    /// Combines reading sessions + vocab reviews into effective seconds per local date.
    /// Each vocab review counts as 30 equivalent seconds (0.5 min).
    private static async Task<Dictionary<DateTime, int>> GetDailyEffectiveSeconds(
        IAppDbContext db, Guid userId, Guid siteId,
        DateTimeOffset since, TimeSpan tzOffset, CancellationToken ct)
    {
        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.SiteId == siteId && s.StartedAt >= since)
            .Select(s => new { s.StartedAt, s.DurationSeconds })
            .ToListAsync(ct);

        var daily = sessions
            .GroupBy(s => s.StartedAt.ToOffset(tzOffset).Date)
            .ToDictionary(g => g.Key, g => g.Sum(s => s.DurationSeconds));

        var reviews = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId && r.CreatedAt >= since)
            .Select(r => r.CreatedAt)
            .ToListAsync(ct);

        foreach (var g in reviews.GroupBy(r => r.ToOffset(tzOffset).Date))
        {
            daily.TryGetValue(g.Key, out var existing);
            daily[g.Key] = existing + g.Count() * 30;
        }

        return daily;
    }

    internal static async Task<int> CalculateStreak(
        IAppDbContext db, Guid userId, Guid siteId, int streakMinMinutes,
        DateTimeOffset now, CancellationToken ct, TimeSpan tzOffset = default)
    {
        var since = now.AddDays(-365);
        var daily = await GetDailyEffectiveSeconds(db, userId, siteId, since, tzOffset, ct);

        if (daily.Count == 0) return 0;

        var thresholdSeconds = streakMinMinutes * 60;
        var qualifyingDates = daily
            .Where(d => d.Value >= thresholdSeconds)
            .Select(d => d.Key)
            .ToHashSet();

        var today = now.ToOffset(tzOffset).Date;
        var streak = 0;
        var checkDate = today;

        // If today doesn't qualify, start from yesterday
        if (!qualifyingDates.Contains(checkDate))
            checkDate = checkDate.AddDays(-1);

        while (qualifyingDates.Contains(checkDate))
        {
            streak++;
            checkDate = checkDate.AddDays(-1);
        }

        return streak;
    }

    private static async Task<int> CalculateLongestStreak(
        IAppDbContext db, Guid userId, Guid siteId, int streakMinMinutes, CancellationToken ct, TimeSpan tzOffset = default)
    {
        var daily = await GetDailyEffectiveSeconds(db, userId, siteId, DateTimeOffset.MinValue, tzOffset, ct);

        if (daily.Count == 0) return 0;

        var thresholdSeconds = streakMinMinutes * 60;
        var sorted = daily.Where(d => d.Value >= thresholdSeconds).Select(d => d.Key).OrderBy(d => d).ToList();

        if (sorted.Count == 0) return 0;

        var longest = 1;
        var current = 1;

        for (var i = 1; i < sorted.Count; i++)
        {
            if ((sorted[i] - sorted[i - 1]).Days == 1)
                current++;
            else
                current = 1;

            if (current > longest) longest = current;
        }

        return longest;
    }
}

// DTOs
public record SubmitSessionRequest(
    Guid? EditionId,
    Guid? UserBookId,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    int DurationSeconds,
    int WordsRead,
    double StartPercent,
    double EndPercent
);

public record SubmitSessionResponse(Guid SessionId, List<string> NewAchievements);

public record SessionDto(
    Guid Id, Guid? EditionId, Guid? UserBookId,
    DateTimeOffset StartedAt, DateTimeOffset EndedAt,
    int DurationSeconds, int WordsRead,
    double StartPercent, double EndPercent
);

public record DailyStatDto(DateTime Date, int TotalSeconds, int TotalWords, int SessionCount);

public record GoalDto(Guid Id, string GoalType, int TargetValue, int Year, int StreakMinMinutes, DateTimeOffset UpdatedAt);

public record CreateGoalRequest(string GoalType, int TargetValue, int Year, int? StreakMinMinutes);

public record AchievementDto(string Code, DateTimeOffset UnlockedAt);

public record ReadingPaceDto(int Wpm, int SessionCount, bool IsUserSpecific);

public record GoalSummaryDto(string Type, int Current, int Target);
public record LibrarySummaryDto(
    int PagesThisMonth,
    int MinutesThisMonth,
    int CurrentStreak,
    int StreakMinMinutes,
    int BooksFinishedYtd,
    GoalSummaryDto? Goal
);

// Book Stats DTOs
public record BookStatsResponse(
    int BooksFinished,
    int TotalPages,
    double AvgDaysToFinish,
    List<GenreStatDto> GenreStats,
    List<AuthorStatDto> AuthorStats,
    List<LanguageStatDto> LanguageStats,
    List<BooksOverTimeDto> BooksOverTime,
    List<BookLengthBucketDto> BookLengthDistribution,
    List<PaceStatDto> PaceStats,
    List<ReadingTimeStatDto> ReadingTimeByGenre,
    List<ReadingTimeStatDto> ReadingTimeByAuthor,
    List<int> AvailableYears
);

public record GenreStatDto(string Name, string Slug, int Count);
public record AuthorStatDto(string Name, string Slug, int Count);
public record LanguageStatDto(string Language, int Count);
public record BooksOverTimeDto(string Period, int Books, int Pages);
public record BookLengthBucketDto(string Bucket, int Count);
public record PaceStatDto(string Pace, int Count);
public record ReadingTimeStatDto(string Name, string Slug, long Seconds);
