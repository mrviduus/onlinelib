using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Application.ReadingTracking;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
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

        // Pre-check the unique-by-(user, user_book, started_at) constraint
        // for user-book sessions. The DB constraint is the source of truth
        // and the catch below still covers a race; this just keeps the
        // happy path off the "SQL error level: ERROR" log line that
        // Npgsql emits before the catch can swallow it. The constraint is
        // partial (WHERE user_book_id IS NOT NULL), so edition-only
        // sessions skip the check entirely.
        if (request.UserBookId != null)
        {
            var dup = await db.ReadingSessions.AnyAsync(
                s => s.UserId == userId.Value
                  && s.UserBookId == request.UserBookId
                  && s.StartedAt == request.StartedAt,
                ct);
            if (dup) return Results.Ok(new SubmitSessionResponse(Guid.Empty, []));
        }

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
            // Race-window fallback: another concurrent request slipped in
            // between our pre-check and SaveChanges. The first one won; we
            // ack idempotently.
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

        var query = db.ReadingSessions
            .Where(s => s.UserId == userId.Value);

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
}
