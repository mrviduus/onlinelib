using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.Tools;

/// <summary>
/// Shared spoiler-gate resolver for the book tools (AI-030/035): the furthest chapter ordinal a user
/// has reached in an edition (high-water mark — flipping back doesn't re-hide already-read chapters),
/// falling back to the current chapter for legacy rows. Null when the user has no progress, so the
/// caller leaves retrieval ungated. Single-site (ADR-007), so no SiteId filter — that's the one
/// difference from <c>RagContextService.ResolveLastReadOrdAsync</c>, which gates the authenticated
/// RAG path and carries the site. Extracted to remove the copy that lived in both search tools.
/// </summary>
internal static class ReadingProgressGate
{
    public static async Task<int?> ResolveLastReadOrdAsync(
        IAppDbContext db, Guid userId, Guid editionId, CancellationToken ct)
    {
        var row = await db.ReadingProgresses
            .Where(p => p.UserId == userId && p.EditionId == editionId)
            .Join(db.Chapters, p => p.ChapterId, c => c.Id,
                (p, c) => new { p.MaxChapterNumber, c.ChapterNumber })
            .FirstOrDefaultAsync(ct);

        return row is null ? null : row.MaxChapterNumber ?? row.ChapterNumber;
    }
}
