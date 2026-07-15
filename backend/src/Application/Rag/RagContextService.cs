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
    /// Builds the spoiler-safe context. When the user has no progress at all (effective ord is null)
    /// both lists are empty — nothing is retrievable until they've read. An ordinal of <c>0</c> is a
    /// real read chapter (catalog chapters are 0-based), so it does NOT mean "nothing read". Pass
    /// <paramref name="currentChapterId"/> (the chapter open in the reader) to count it as read even
    /// before the debounced progress-save persists; it's resolved to an ordinal server-side and ignored
    /// unless it belongs to this edition.
    /// </summary>
    public async Task<RagContext> BuildAsync(
        Guid userId, Guid siteId, Guid editionId, string query, int k,
        Guid? currentChapterId, bool includeSummaries, CancellationToken ct)
    {
        var persistedLastRead = await ResolveLastReadOrdAsync(userId, siteId, editionId, ct);
        var currentOrd = await ResolveCurrentChapterOrdAsync(editionId, currentChapterId, ct);

        // The spoiler gate is an anti-accidental-spoiler UX guard, not a security boundary — the book
        // is public/free and the reader can navigate ahead anyway. Counting the chapter they're
        // actively viewing is correct and unblocks "ask about what I'm reading" without waiting on the
        // 2s progress-sync debounce. We resolve the ordinal server-side (above) so a client can't
        // claim a fake high ord; an id from another edition resolves to null and is ignored.
        var lastRead = EffectiveLastReadOrd(persistedLastRead, currentOrd);
        // null = no progress at all → empty. 0 = read the first (0-based) chapter → retrieve normally.
        if (lastRead is null)
            return new RagContext([], [], 0);

        var chunks = await rag.RetrieveAsync(editionId, query, k, maxChapterOrd: lastRead, includeSummaries, ct);
        var notes = await GetPrivateNotesAsync(userId, siteId, editionId, lastRead.Value, ct);
        return new RagContext(chunks, notes, lastRead.Value);
    }

    /// <summary>
    /// Ungated context build for the persistent Book Chat when the spoiler gate is toggled OFF: retrieves
    /// over the WHOLE edition (<c>maxChapterOrd: null</c>) and includes the user's highlights/notes from
    /// every chapter. Reuses the same retrieval + private-corpus helpers as <see cref="BuildAsync"/> — only
    /// the chapter cap is lifted. <see cref="RagContext.LastReadOrd"/> is still the user's furthest-read
    /// chapter (for the client's progress display), resolved but not used to gate.
    /// </summary>
    public async Task<RagContext> BuildUngatedAsync(
        Guid userId, Guid siteId, Guid editionId, string query, int k, bool includeSummaries, CancellationToken ct)
    {
        var chunks = await rag.RetrieveAsync(editionId, query, k, maxChapterOrd: null, includeSummaries, ct);
        var notes = await GetPrivateNotesAsync(userId, siteId, editionId, int.MaxValue, ct);
        var lastRead = await ResolveLastReadOrdAsync(userId, siteId, editionId, ct) ?? 0;
        return new RagContext(chunks, notes, lastRead);
    }

    /// <summary>
    /// The gate ordinal: the larger of the persisted high-water mark and the currently-open chapter's
    /// ordinal. Each input is null when absent (no progress row / chapter not in this edition); the
    /// result is null only when BOTH are null. A present <c>0</c> is a real read chapter (catalog
    /// chapters are 0-based) and wins over null. Pure so it's directly unit-testable.
    /// </summary>
    public static int? EffectiveLastReadOrd(int? persistedLastRead, int? currentOrd)
        => (persistedLastRead, currentOrd) switch
        {
            (null, null) => null,
            (null, var c) => c,
            (var p, null) => p,
            (var p, var c) => Math.Max(p.Value, c.Value),
        };

    /// <summary>
    /// Resolves the open chapter's ordinal authoritatively from the DB, but only if it belongs to this
    /// edition (so a client can't pass a fake/foreign id to peek ahead). null when no id is supplied or
    /// it isn't part of this edition; an ordinal of 0 is a legitimate (0-based) first chapter.
    /// </summary>
    public async Task<int?> ResolveCurrentChapterOrdAsync(
        Guid editionId, Guid? currentChapterId, CancellationToken ct)
    {
        if (currentChapterId is not { } id)
            return null;

        return await db.Chapters
            .Where(c => c.Id == id && c.EditionId == editionId)
            .Select(c => (int?)c.ChapterNumber)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// The furthest chapter ordinal the user has reached in this edition (high-water mark), so
    /// flipping back doesn't hide already-read chapters; falls back to the current chapter's ordinal
    /// when the mark is null (legacy rows). null when there's no progress row at all — distinct from a
    /// resolved ordinal of 0 (the read first, 0-based chapter).
    /// </summary>
    public async Task<int?> ResolveLastReadOrdAsync(
        Guid userId, Guid siteId, Guid editionId, CancellationToken ct)
    {
        var row = await db.ReadingProgresses
            .Where(p => p.UserId == userId && p.EditionId == editionId)
            .Join(db.Chapters, p => p.ChapterId, c => c.Id,
                (p, c) => new { p.MaxChapterNumber, c.ChapterNumber })
            .FirstOrDefaultAsync(ct);

        return row is null ? null : row.MaxChapterNumber ?? row.ChapterNumber;
    }

    /// <summary>Highlights + notes from chapters with ChapterNumber ≤ maxOrd (read chapters).</summary>
    public async Task<IReadOnlyList<PrivateNote>> GetPrivateNotesAsync(
        Guid userId, Guid siteId, Guid editionId, int maxOrd, CancellationToken ct)
    {
        // 0 is a valid read (0-based first) chapter; only a negative ord means "none".
        if (maxOrd < 0)
            return [];

        // Materialize raw fields first — HighlightToText is a C# method EF can't translate.
        var highlightRows = await db.Highlights
            .Where(h => h.UserId == userId && h.EditionId == editionId
                        && h.ChapterId != null && h.Chapter!.ChapterNumber <= maxOrd)
            .Select(h => new { h.ChapterId, Ord = h.Chapter!.ChapterNumber, h.SelectedText, h.NoteText })
            .ToListAsync(ct);

        // Only free-standing notes — a note attached to a highlight (HighlightId set) is already
        // represented via that highlight's inline NoteText, so including it again would double-count.
        var noteRows = await db.Notes
            .Where(n => n.UserId == userId && n.EditionId == editionId
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
