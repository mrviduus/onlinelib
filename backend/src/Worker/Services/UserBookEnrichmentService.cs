using Domain.Entities;
using Domain.Enums;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

/// <summary>
/// The single seam that runs a user book's metadata enrichment with a visible, terminal status. Both the
/// ingestion inline-kick and the sweep <see cref="MetadataEnrichmentWorker"/> route through here, so the
/// atomic claim (Pending → Running) makes a double-trigger safe. The enrichment itself is best-effort:
/// the status always reaches a terminal state (Completed even when nothing was filled, or Failed on error)
/// — that is what kills the "forever-enriching" badge.
/// </summary>
public class UserBookEnrichmentService(
    IDbContextFactory<AppDbContext> dbFactory,
    IBookMetadataGenerator metadataGenerator,
    ILogger<UserBookEnrichmentService> logger)
{
    public async Task EnrichAsync(Guid bookId, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        // Atomic claim: only the caller that flips Pending → Running proceeds. Concurrent inline-kick +
        // sweep both race here; the loser sees rowcount 0 and returns. now() also stamps stale detection.
        var claimed = await db.UserBooks
            .Where(b => b.Id == bookId && b.MetadataEnrichmentStatus == MetadataEnrichmentStatus.Pending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(b => b.MetadataEnrichmentStatus, MetadataEnrichmentStatus.Running)
                .SetProperty(b => b.MetadataEnrichmentAt, DateTimeOffset.UtcNow), ct);

        if (claimed == 0) return; // already claimed / not pending — double-trigger safe

        var book = await db.UserBooks.FirstOrDefaultAsync(b => b.Id == bookId, ct);
        if (book is null) return;

        try
        {
            await ApplyEnrichmentAsync(db, book, ct);

            // Terminal even when nothing was filled — this is what kills "forever-enriching".
            book.MetadataEnrichmentStatus = MetadataEnrichmentStatus.Completed;
            book.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Metadata enrichment failed for book {BookId}", bookId);
            try
            {
                book.MetadataEnrichmentStatus = MetadataEnrichmentStatus.Failed;
                book.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(CancellationToken.None);
            }
            catch (Exception ex2)
            {
                logger.LogWarning(ex2, "Failed to persist Failed enrichment status for {BookId}", bookId);
            }
        }
    }

    /// <summary>
    /// The extracted ingestion enrichment body: cross-checked/calibrated agent metadata (Ollama fallback
    /// inside <see cref="IBookMetadataGenerator.EnrichAsync"/>) merged into the still-null fields, honouring
    /// the 'manual' SeoSource guard. Mutates <paramref name="book"/> only; the caller owns the SaveChanges +
    /// terminal status transition so the status is stamped whether or not any field changed.
    /// </summary>
    private async Task ApplyEnrichmentAsync(AppDbContext db, UserBook book, CancellationToken ct)
    {
        var needsDescription = string.IsNullOrEmpty(book.Description);
        var excerpt = await db.UserChapters
            .Where(c => c.UserBookId == book.Id)
            .OrderBy(c => c.ChapterNumber)
            .Select(c => c.PlainText)
            .FirstOrDefaultAsync(ct);

        // AI-Agent-1: tool-using, cross-checked, calibrated (Open Library) with the opening excerpt for
        // genre/tone cues. Falls back to Ollama internally on agent error / budget exhaustion / gaps.
        var meta = await metadataGenerator.EnrichAsync(
            book.Id, book.Title, book.Author, excerpt, needsDescription, ct);

        if (meta is null) return;

        // Never overwrite user-edited ('manual') metadata — mirrors the SEO backfill guard.
        if (string.Equals(book.SeoSource, "manual", StringComparison.OrdinalIgnoreCase)) return;

        var changed = false;
        if (meta.Genre != null && string.IsNullOrEmpty(book.Genre))
        { book.Genre = meta.Genre; changed = true; }
        if (meta.PublishedYear != null && book.PublishedYear == null)
        { book.PublishedYear = meta.PublishedYear; changed = true; }
        if (meta.Description != null && string.IsNullOrEmpty(book.Description))
        { book.Description = meta.Description; changed = true; }

        if (changed)
        {
            // Persist provenance/confidence from the agent path (null on the Ollama fallback / hybrid merge).
            if (meta.Confidence is not null) book.MetadataConfidence = meta.Confidence;
            if (meta.ProvenanceJson is not null) book.MetadataProvenanceJson = meta.ProvenanceJson;
        }
    }
}
