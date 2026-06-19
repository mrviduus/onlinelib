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
    /// <summary>Upper bound on private-corpus items, so a heavy annotator can't blow the prompt budget.</summary>
    public const int PrivateNoteCap = 30;

    /// <summary>
    /// Builds the spoiler-safe context. When the user has no progress (lastRead = 0) both lists
    /// are empty — nothing is retrievable until they've read. Pass <paramref name="currentChapterId"/>
    /// (the chapter open in the reader) to count it as read even before the debounced progress-save
    /// persists; it's resolved to an ordinal server-side and ignored unless it belongs to this edition.
    /// </summary>
    public async Task<RagContext> BuildAsync(
        Guid userId, Guid siteId, Guid editionId, string query, int k,
        Guid? currentChapterId, CancellationToken ct)
    {
        var persistedLastRead = await ResolveLastReadOrdAsync(userId, siteId, editionId, ct);
        var currentOrd = await ResolveCurrentChapterOrdAsync(editionId, currentChapterId, ct);

        // The spoiler gate is an anti-accidental-spoiler UX guard, not a security boundary — the book
        // is public/free and the reader can navigate ahead anyway. Counting the chapter they're
        // actively viewing is correct and unblocks "ask about what I'm reading" without waiting on the
        // 2s progress-sync debounce. We resolve the ordinal server-side (above) so a client can't
        // claim a fake high ord; an id from another edition resolves to 0 and is ignored.
        var lastRead = EffectiveLastReadOrd(persistedLastRead, currentOrd);
        if (lastRead <= 0)
            return new RagContext([], [], 0);

        var chunks = await rag.RetrieveAsync(editionId, query, k, maxChapterOrd: lastRead, ct);
        var notes = await GetPrivateNotesAsync(userId, siteId, editionId, lastRead, ct);
        return new RagContext(chunks, notes, lastRead);
    }

    /// <summary>
    /// The gate ordinal: the larger of the persisted high-water mark and the currently-open chapter's
    /// ordinal (0 when that chapter isn't part of this edition). Pure so it's directly unit-testable.
    /// </summary>
    public static int EffectiveLastReadOrd(int persistedLastRead, int currentOrd)
        => Math.Max(persistedLastRead, currentOrd);

    /// <summary>
    /// Resolves the open chapter's ordinal authoritatively from the DB, but only if it belongs to this
    /// edition (so a client can't pass a fake/foreign id to peek ahead). 0 when null or not matched.
    /// </summary>
    public async Task<int> ResolveCurrentChapterOrdAsync(
        Guid editionId, Guid? currentChapterId, CancellationToken ct)
    {
        if (currentChapterId is not { } id)
            return 0;

        return await db.Chapters
            .Where(c => c.Id == id && c.EditionId == editionId)
            .Select(c => c.ChapterNumber)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// The furthest chapter ordinal the user has reached in this edition (high-water mark), so
    /// flipping back doesn't hide already-read chapters; falls back to the current chapter when the
    /// mark is null (legacy rows). 0 when there's no progress at all.
    /// </summary>
    public async Task<int> ResolveLastReadOrdAsync(
        Guid userId, Guid siteId, Guid editionId, CancellationToken ct)
    {
        var row = await db.ReadingProgresses
            .Where(p => p.UserId == userId && p.SiteId == siteId && p.EditionId == editionId)
            .Join(db.Chapters, p => p.ChapterId, c => c.Id,
                (p, c) => new { p.MaxChapterNumber, c.ChapterNumber })
            .FirstOrDefaultAsync(ct);

        return row is null ? 0 : row.MaxChapterNumber ?? row.ChapterNumber;
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

        // Only free-standing notes — a note attached to a highlight (HighlightId set) is already
        // represented via that highlight's inline NoteText, so including it again would double-count.
        var noteRows = await db.Notes
            .Where(n => n.UserId == userId && n.SiteId == siteId && n.EditionId == editionId
                        && n.HighlightId == null && n.Chapter.ChapterNumber <= maxOrd)
            .Select(n => new { ChapterId = (Guid?)n.ChapterId, Ord = n.Chapter.ChapterNumber, n.Text })
            .ToListAsync(ct);

        return highlightRows
            .Select(h => new PrivateNote(h.ChapterId, h.Ord, "highlight", HighlightToText(h.SelectedText, h.NoteText)))
            .Concat(noteRows.Select(n => new PrivateNote(n.ChapterId, n.Ord, "note", n.Text)))
            // Cap to the most recent chapters (closest to where the user is reading), then present in order.
            .OrderByDescending(n => n.ChapterOrd)
            .Take(PrivateNoteCap)
            .OrderBy(n => n.ChapterOrd)
            .ToList();
    }

    /// <summary>Renders a highlight as context text: the selection, plus its inline note if any.</summary>
    public static string HighlightToText(string selectedText, string? noteText)
        => string.IsNullOrWhiteSpace(noteText) ? selectedText : $"{selectedText} — note: {noteText}";
}
