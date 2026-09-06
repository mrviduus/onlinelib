using Application.Auth;
using Application.Common.Interfaces;
using Application.Vocabulary;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// Word lookups (Phase 3 F1): rare/OOV taps land here instead of polluting
/// the SRS queue. "Add anyway" promotes a lookup to VocabularyWord
/// (bypasses daily cap, respects the 5000-word hard ceiling).
/// </summary>
public static partial class VocabularyEndpoints
{
    private static async Task<IResult> GetLookups(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var take = Math.Clamp(limit ?? 50, 1, 200);
        var skip = Math.Max(0, offset ?? 0);

        var baseQuery = db.WordLookups
            .Where(l => l.UserId == userId);

        var total = await baseQuery.CountAsync(ct);
        var items = await baseQuery
            .OrderByDescending(l => l.LastTappedAt)
            .Skip(skip)
            .Take(take)
            .Select(l => new WordLookupDto(
                l.Id, l.Word, l.Language, l.ZipfRank, l.TapCount,
                l.Sentence, l.BookTitle, l.EditionId, l.ChapterId, l.UserBookId,
                l.LastTranslation, l.FirstTappedAt, l.LastTappedAt))
            .ToListAsync(ct);

        return Results.Ok(new WordLookupListResponse(items, total));
    }

    // "Add anyway" — user overrides the frequency filter. Creates a VocabularyWord
    // directly and drops the Lookup. Bypasses the user's OWN daily cap on purpose: they explicitly
    // asked for this word. It does NOT bypass the tier's enrichment cap — see the check below.
    private static async Task<IResult> PromoteLookup(
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

        var lookup = await db.WordLookups
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId, ct);
        if (lookup == null) return Results.NotFound();

        // Guard against a race where the word was saved via another path between
        // the list render and the promote click.
        var already = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.UserId == userId && w.Word == lookup.Word && w.Language == lookup.Language, ct);
        if (already != null)
        {
            db.WordLookups.Remove(lookup);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(already));
        }

        // Hard ceiling still applies — Add Anyway bypasses the daily cap, not
        // the 5000-word vocabulary limit. Counts all three buckets so a user
        // can't exceed the cap via the lookup bypass.
        var count = await CountAllBucketsAsync(db, userId, ct);
        if (count >= MaxWordsPerUser)
            return Results.Problem("Vocabulary limit reached (5000 words)", statusCode: 429);

        // The tier's enrichment cap, on the other hand, is NOT the user's to override: it is the
        // platform's LLM spend, and this promotion queues the same paid enrichment as a fresh save.
        // Exactly the argument PromotePending already makes, applied to the sibling bucket — without
        // it a guest parks rare words in lookups all day (that branch of SaveWord returns before the
        // cap check, because a lookup row costs nothing) and then promotes them one at a time, up to
        // the 5000-word ceiling. That is 100x the tier's daily allowance through the one door that
        // wasn't watched.
        var tierCap = await dailyCap.GetEntitlementCapStatusAsync(userId, siteId, DateTimeOffset.UtcNow, ct);
        if (tierCap.Remaining <= 0)
        {
            return Results.Problem(
                $"Daily limit reached ({tierCap.Cap} new words). Create a free account to keep going.",
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        var now = DateTimeOffset.UtcNow;
        var entry = new VocabularyWord
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            Word = lookup.Word,
            Language = lookup.Language,
            Translation = lookup.LastTranslation,
            EditionId = lookup.EditionId,
            ChapterId = lookup.ChapterId,
            UserBookId = lookup.UserBookId,
            Sentence = lookup.Sentence,
            BookTitle = lookup.BookTitle,
            ZipfRank = lookup.ZipfRank,
            Source = "manual_add_anyway",
            ActivatedAt = now,
            Stage = 0,
            IntervalDays = 0,
            ConsecutiveCorrect = 0,
            NextReviewAt = now,
            TotalReviews = 0,
            CorrectReviews = 0,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.VocabularyWords.Add(entry);
        db.WordLookups.Remove(lookup);
        await db.SaveChangesAsync(ct);

        var nativeLang = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.NativeLanguage)
            .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(nativeLang))
        {
            QueueEnrichment(scopeFactory, logger, entry.Id, entry.Word, entry.Language,
                entry.Definition, entry.Sentence, nativeLang);
        }

        return Results.Ok(ToDto(entry));
    }

    private static async Task<IResult> DismissLookup(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var lookup = await db.WordLookups
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId, ct);
        if (lookup == null) return Results.NotFound();

        db.WordLookups.Remove(lookup);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
