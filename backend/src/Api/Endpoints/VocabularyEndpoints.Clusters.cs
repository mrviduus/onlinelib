using Application.Auth;
using Application.Common.Interfaces;
using Application.Vocabulary;
using Microsoft.EntityFrameworkCore;
using TextStack.Vocabulary;
using TextStack.Vocabulary.Contracts;

namespace Api.Endpoints;

/// <summary>
/// Thematic word clusters (Phase 4 F3) bonus rounds: LLM-grouped sets of
/// related vocabulary the user can opt into for an extra MC quiz pass.
/// </summary>
public static partial class VocabularyEndpoints
{
    private static async Task<IResult> GetClusters(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var clusters = await db.WordClusters
            .Where(c => c.UserId == userId
                     && c.SiteId == siteId
                     && !c.IsDismissed
                     && c.CompletedAt == null)
            .OrderByDescending(c => c.CreatedAt)
            .Take(10)
            .Select(c => new WordClusterDto(
                c.Id, c.Title, c.Theme,
                c.EditionId, c.UserBookId, c.BookTitle,
                c.MemberCount, c.CohesionScore,
                c.IsConfirmed, c.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(new { items = clusters });
    }

    private static async Task<IResult> StartClusterBonus(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IReviewCardBuilder cardBuilder,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var cluster = await db.WordClusters
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId && c.SiteId == siteId, ct);
        if (cluster == null) return Results.NotFound();
        if (cluster.IsDismissed || cluster.CompletedAt != null) return Results.Conflict();

        // Load cluster members. Retired members are skipped — they graduated.
        var members = await db.VocabularyWords
            .Where(w => w.ClusterId == id
                     && w.UserId == userId
                     && w.SiteId == siteId
                     && !w.IsRetired)
            .ToListAsync(ct);

        if (members.Count == 0) return Results.NotFound();

        // Distractor pool from user's other words (not in cluster).
        var languages = members.Select(w => w.Language).Distinct().ToList();
        var memberIds = members.Select(w => w.Id).ToHashSet();
        var pool = await db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId
                     && !memberIds.Contains(w.Id)
                     && languages.Contains(w.Language))
            .OrderBy(_ => EF.Functions.Random())
            .Take(MaxDistractorPoolSize)
            .Select(w => new DistractorPoolEntry(w.Word, w.Language))
            .ToListAsync(ct);

        var wordsForReview = members.Select(w => new WordForReview(
            w.Id, w.Word, w.Language,
            w.Translation, w.Definition,
            w.Sentence, w.BookTitle, w.Hint,
            w.Explanation, w.Distractors,
            w.Stage, w.TotalReviews)).ToList();

        var cards = cardBuilder.BuildCards(wordsForReview, pool);
        var cardDtos = cards.Select(c => new ReviewCardDto(
            c.WordId, c.Word, c.Translation, c.Definition,
            c.ReviewMode, c.BlankSentence, c.OriginalSentence, c.BookTitle,
            c.Hint, c.Explanation, c.IsNew, c.Options, c.CorrectOptionIndex)).ToList();

        cluster.IsConfirmed = true;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { clusterId = cluster.Id, title = cluster.Title, cards = cardDtos });
    }

    private static async Task<IResult> DismissCluster(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var cluster = await db.WordClusters
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId && c.SiteId == siteId, ct);
        if (cluster == null) return Results.NotFound();

        cluster.IsDismissed = true;
        cluster.DismissedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> CompleteCluster(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var cluster = await db.WordClusters
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId && c.SiteId == siteId, ct);
        if (cluster == null) return Results.NotFound();

        cluster.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
