using Application.Common.Interfaces;
using Contracts.ReadingTracking;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.ReadingTracking;

/// <summary>
/// Mutating reading-session submit (R5 slice-4). Body moved verbatim from the former
/// <c>ReadingTrackingEndpoints.SubmitSession</c> handler — kept separate from the read-only
/// <see cref="ReadingStatsService"/>. The side-effect ordering is load-bearing and preserved exactly:
/// dedup pre-check (user-book only) → build session (SiteId set by hand) → Add → SaveChanges (with the
/// 23505 race fallback) → best-effort achievement award. Note the asymmetry the original relied on:
/// the pre-check duplicate returns <c>Guid.Empty</c> (nothing was inserted) while the race fallback
/// returns <c>session.Id</c> (our row lost the insert race but the caller acks idempotently). The
/// achievement block runs strictly AFTER the save because the checker reads persisted state (the just-
/// saved session must already be in the table for e.g. <c>first_session</c> to unlock), and it is
/// best-effort: any exception there is logged and swallowed so the submit still succeeds. The HTTP
/// validations + auth stay in the thin handler.
/// </summary>
public class ReadingSessionService(IAppDbContext db, ILogger<ReadingSessionService> logger)
{
    public async Task<SubmitSessionResponse> SubmitAsync(
        Guid userId, Guid siteId, SubmitSessionRequest request, CancellationToken ct)
    {
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
                s => s.UserId == userId
                  && s.UserBookId == request.UserBookId
                  && s.StartedAt == request.StartedAt,
                ct);
            if (dup) return new SubmitSessionResponse(Guid.Empty, []);
        }

        var session = new ReadingSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
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
            return new SubmitSessionResponse(session.Id, []);
        }

        // Achievement check is best-effort — never fail the session submit because of it.
        List<string> newAchievements = [];
        try
        {
            var streakMinMinutes = await StreakCalculator.GetStreakMinMinutes(db, userId, ct);
            var currentStreak = await StreakCalculator.CalculateStreak(db, userId, streakMinMinutes, request.EndedAt, ct);

            var checker = new AchievementChecker(db);
            newAchievements = await checker.CheckAfterSession(userId, siteId, session, currentStreak, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AchievementChecker failed for session {SessionId}, session still saved", session.Id);
        }

        return new SubmitSessionResponse(session.Id, newAchievements);
    }
}
