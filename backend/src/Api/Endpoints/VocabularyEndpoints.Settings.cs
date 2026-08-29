using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// Anti-spiral settings (DailyNewCap / WeeklyReviewBudget / frequency
/// filter / clustering / auto-retire) and the Unretire flow that pulls
/// a word back into review without restarting at Stage 0.
/// </summary>
public static partial class VocabularyEndpoints
{
    private static async Task<IResult> GetSettings(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var settings = await db.UserVocabularySettings
            .FirstOrDefaultAsync(s => s.UserId == userId, ct);

        // First-time read: return defaults without persisting — settings row is
        // created lazily on first PUT to avoid a write on every new user.
        return Results.Ok(new VocabSettingsDto(
            DailyNewCap: settings?.DailyNewCap ?? 15,
            WeeklyReviewBudget: settings?.WeeklyReviewBudget ?? 70,
            FrequencyFilterEnabled: settings?.FrequencyFilterEnabled ?? false,
            ClusteringEnabled: settings?.ClusteringEnabled ?? true,
            AutoRetireEnabled: settings?.AutoRetireEnabled ?? true,
            AutoSpeakCards: settings?.AutoSpeakCards ?? true));
    }

    private static async Task<IResult> UpdateSettings(
        [FromBody] VocabSettingsDto request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        if (request.DailyNewCap is < 5 or > 100)
            return Results.BadRequest("DailyNewCap must be 5–100");
        if (request.WeeklyReviewBudget is < 10 or > 500)
            return Results.BadRequest("WeeklyReviewBudget must be 10–500");

        var settings = await db.UserVocabularySettings
            .FirstOrDefaultAsync(s => s.UserId == userId, ct);
        var now = DateTimeOffset.UtcNow;

        if (settings is null)
        {
            settings = new UserVocabularySettings
            {
                UserId = userId,
                SiteId = siteId,
                CreatedAt = now,
            };
            db.UserVocabularySettings.Add(settings);
        }

        settings.DailyNewCap = request.DailyNewCap;
        settings.WeeklyReviewBudget = request.WeeklyReviewBudget;
        settings.FrequencyFilterEnabled = request.FrequencyFilterEnabled;
        settings.ClusteringEnabled = request.ClusteringEnabled;
        settings.AutoRetireEnabled = request.AutoRetireEnabled;
        settings.AutoSpeakCards = request.AutoSpeakCards;
        settings.UpdatedAt = now;

        await db.SaveChangesAsync(ct);
        return Results.Ok(request);
    }

    // --- Unretire (Phase 1) ---

    private static async Task<IResult> UnretireWord(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var word = await FindUserWordAsync(db, id, userId, siteId, ct);
        if (word == null) return Results.NotFound();

        if (!word.IsRetired) return Results.Ok(ToDto(word));

        // Drop back to Stage 3 (Context), not Stage 0 — the user once mastered
        // this word, so we're only asking for one resurfacing review, not
        // starting from scratch. ConsecutiveCorrect resets so the 3/14d
        // retirement rule has to be re-earned.
        var now = DateTimeOffset.UtcNow;
        word.IsRetired = false;
        word.RetiredAt = null;
        word.RetiredReason = null;
        word.Stage = 3;
        word.ConsecutiveCorrect = 0;
        word.IntervalDays = 1;
        word.NextReviewAt = now;
        word.UpdatedAt = now;

        await db.SaveChangesAsync(ct);
        return Results.Ok(ToDto(word));
    }
}
