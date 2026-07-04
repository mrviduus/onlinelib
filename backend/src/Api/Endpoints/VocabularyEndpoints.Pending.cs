using Application.Auth;
using Application.Common.Interfaces;
using Application.Vocabulary;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// Anti-spiral pending buffer (Phase 2): over-cap word saves land in
/// `PendingVocabularyWords`; the daily-cap roller promotes them, or the
/// user can manually `Promote`/`Dismiss`.
/// </summary>
public static partial class VocabularyEndpoints
{
    private static async Task<IResult> GetPending(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        DailyCapService dailyCap,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var items = await db.PendingVocabularyWords
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.Priority)
            .ThenBy(p => p.CreatedAt)
            .Select(p => new PendingVocabWordDto(
                p.Id, p.Word, p.Language, p.Translation, p.Definition,
                p.EditionId, p.ChapterId, p.UserBookId,
                p.Sentence, p.BookTitle, p.Priority, p.Source, p.CreatedAt))
            .ToListAsync(ct);

        var cap = await dailyCap.GetStatusAsync(userId, siteId, ct);
        return Results.Ok(new PendingListResponse(items, cap.Used, cap.Cap, cap.Remaining));
    }

    // Manual promote — bypasses the daily cap. User explicitly asked for this
    // word to skip the queue; respect it even if today is "full".
    private static async Task<IResult> PromotePending(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        DailyCapService dailyCap,
        IServiceScopeFactory scopeFactory,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var pending = await db.PendingVocabularyWords
            .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (pending == null) return Results.NotFound();

        // Capture enrichment inputs before PromoteAsync disposes the pending row.
        var wordText = pending.Word;
        var lang = pending.Language;
        var def = pending.Definition;
        var sent = pending.Sentence;

        var now = DateTimeOffset.UtcNow;
        var promoted = await dailyCap.PromoteAsync(pending, now, ct);

        var nativeLang = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.NativeLanguage)
            .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(nativeLang))
        {
            QueueEnrichment(scopeFactory, logger, promoted.Id, wordText, lang, def, sent, nativeLang);
        }

        return Results.Ok(ToDto(promoted));
    }

    private static async Task<IResult> DismissPending(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var pending = await db.PendingVocabularyWords
            .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (pending == null) return Results.NotFound();

        db.PendingVocabularyWords.Remove(pending);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
