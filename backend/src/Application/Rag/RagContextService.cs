using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using TextStack.Ai.Rag;

namespace Application.Rag;

/// <summary>A user's own annotation included as guaranteed RAG context (Phase 4 private corpus).</summary>
/// <param name="Kind">"highlight" or "note".</param>
public record PrivateNote(Guid? ChapterId, int ChapterOrd, string Kind, string Text);

/// <summary>
/// Spoiler-safe retrieval context for one user + edition: the book chunks they're allowed to see
/// plus their own highlights/notes from read chapters.
/// </summary>
public record RagContext(
    IReadOnlyList<RetrievedChunk> Chunks,
    IReadOnlyList<PrivateNote> Notes,
    int LastReadOrd);

/// <summary>
/// Builds spoiler-safe RAG context (AI-024). Resolves the user's last-read chapter from
/// <see cref="ReadingProgress"/>, gates chunk retrieval to <c>chapter_ord ≤ lastRead</c>, and
/// adds the user's highlights + notes from read chapters as guaranteed context. The hard gate
/// lives in SQL (<see cref="RagService"/>) — never in a prompt. The public Ask endpoint (AI-025)
/// consumes this.
/// </summary>
public sealed class RagContextService(IAppDbContext db, IRagService rag)
{
    /// <summary>
    /// Builds the spoiler-safe context. When the user has no progress (lastRead = 0) both lists
    /// are empty — nothing is retrievable until they've read.
    /// </summary>
    public async Task<RagContext> BuildAsync(
        Guid userId, Guid siteId, Guid editionId, string query, int k, CancellationToken ct)
    {
        var lastRead = await ResolveLastReadOrdAsync(userId, siteId, editionId, ct);
        if (lastRead <= 0)
            return new RagContext([], [], 0);

        var chunks = await rag.RetrieveAsync(editionId, query, k, maxChapterOrd: lastRead, ct);
        var notes = await GetPrivateNotesAsync(userId, siteId, editionId, lastRead, ct);
        return new RagContext(chunks, notes, lastRead);
    }

    /// <summary>The 1-based ordinal of the user's current chapter; 0 if no progress.</summary>
    public async Task<int> ResolveLastReadOrdAsync(
        Guid userId, Guid siteId, Guid editionId, CancellationToken ct)
    {
        return await db.ReadingProgresses
            .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == editionId)
            .Join(db.Chapters, p => p.ChapterId, c => c.Id, (p, c) => c.ChapterNumber)
            .FirstOrDefaultAsync(ct); // 0 when no progress row exists
    }

    /// <summary>Highlights + notes from chapters with ChapterNumber ≤ maxOrd (read chapters).</summary>
    public async Task<IReadOnlyList<PrivateNote>> GetPrivateNotesAsync(
        Guid userId, Guid siteId, Guid editionId, int maxOrd, CancellationToken ct)
    {
        if (maxOrd <= 0)
            return [];

        // Materialize raw fields first — HighlightToText is a C# method EF can't translate.
        var highlightRows = await db.Highlights
            .Where(h => h.UserId == userId && h.SiteId == siteId && h.EditionId == editionId
                        && h.ChapterId != null && h.Chapter!.ChapterNumber <= maxOrd)
            .Select(h => new { h.ChapterId, Ord = h.Chapter!.ChapterNumber, h.SelectedText, h.NoteText })
            .ToListAsync(ct);

        var noteRows = await db.Notes
            .Where(n => n.UserId == userId && n.SiteId == siteId && n.EditionId == editionId
                        && n.Chapter.ChapterNumber <= maxOrd)
            .Select(n => new { ChapterId = (Guid?)n.ChapterId, Ord = n.Chapter.ChapterNumber, n.Text })
            .ToListAsync(ct);

        return highlightRows
            .Select(h => new PrivateNote(h.ChapterId, h.Ord, "highlight", HighlightToText(h.SelectedText, h.NoteText)))
            .Concat(noteRows.Select(n => new PrivateNote(n.ChapterId, n.Ord, "note", n.Text)))
            .OrderBy(n => n.ChapterOrd)
            .ToList();
    }

    /// <summary>Renders a highlight as context text: the selection, plus its inline note if any.</summary>
    public static string HighlightToText(string selectedText, string? noteText)
        => string.IsNullOrWhiteSpace(noteText) ? selectedText : $"{selectedText} — note: {noteText}";
}
