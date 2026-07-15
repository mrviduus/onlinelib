using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using TextStack.Ai.Rag;

namespace Application.Rag;

/// <summary>
/// Builds RAG context for "Ask this book" over a USER-uploaded book (Phase 2 — sibling to
/// <see cref="RagContextService"/> for the catalog). Differences from the catalog path:
/// <list type="bullet">
///   <item><b>Ownership-scoped:</b> the book must belong to <c>userId</c>; otherwise null (the
///   endpoint maps that to 404).</item>
///   <item><b>No spoiler gate:</b> it's the user's own document, so the full book is retrievable
///   (<c>maxChapterOrd: null</c>) regardless of reading progress.</item>
///   <item><b>Per-user isolation:</b> retrieval filters on both <c>user_id</c> and
///   <c>user_book_id</c> in SQL (<see cref="IRagService.RetrieveUserBookAsync"/>).</item>
/// </list>
/// Book Chat (persistent chat) scope: the user's own highlights/notes for the book are now loaded as
/// guaranteed private context (<see cref="UserBookRagContext.Notes"/>), mirroring the catalog private
/// corpus, so "what did I highlight about X?" works. User books have no free-standing <c>Note</c> rows
/// (Note is edition-only), so the corpus is highlights only — inline highlight notes included, no
/// double-count risk. The LEGACY <c>/me/books/{id}/ask</c> endpoint ignores Notes (passes <c>[]</c>), so
/// its behavior is unchanged.
/// </summary>
public sealed class UserBookRagContextService(IAppDbContext db, IRagService rag)
{
    /// <summary>
    /// Resolves the user book (must be owned by <paramref name="userId"/> and not taken down), retrieves the
    /// top <paramref name="k"/> chunks for <paramref name="query"/> over the whole book, and loads the user's
    /// own highlights on the book as private context. Returns null when the book doesn't exist / isn't this
    /// user's — the caller returns 404. An owned-but-unindexed book yields an empty chunk list.
    /// </summary>
    public async Task<UserBookRagContext?> BuildAsync(
        Guid userId, Guid userBookId, string query, int k, SummarySpec summaries, CancellationToken ct)
    {
        var owns = await db.UserBooks
            .AnyAsync(b => b.Id == userBookId && b.UserId == userId && b.TakedownAt == null, ct);
        if (!owns)
            return null;

        // Full-book retrieval (no gate). The SQL itself also filters user_id + user_book_id, so even a
        // mismatched id can't surface another user's chunks.
        var chunks = await rag.RetrieveUserBookAsync(userId, userBookId, query, k, maxChapterOrd: null, summaries, ct);
        var notes = await GetPrivateNotesAsync(userId, userBookId, ct);
        return new UserBookRagContext(chunks, notes);
    }

    /// <summary>
    /// The user's highlights on their own book, as guaranteed private context. Owner-scoped on
    /// <c>user_id</c> + <c>user_book_id</c> (another user's highlights never leak). Text is the selection
    /// plus its inline note; a PDF-anchored highlight is prefixed with its page (e.g. "p.12: …") when the
    /// page is cheaply available in the anchor JSON. Capped like the catalog path
    /// (<see cref="RagContextService.PrivateNoteCap"/>), newest-first then presented chronologically.
    /// </summary>
    public async Task<IReadOnlyList<PrivateNote>> GetPrivateNotesAsync(
        Guid userId, Guid userBookId, CancellationToken ct)
    {
        var rows = await db.Highlights
            .Where(h => h.UserId == userId && h.UserBookId == userBookId)
            .OrderByDescending(h => h.CreatedAt)
            .Take(RagContextService.PrivateNoteCap)
            .Select(h => new { h.UserChapterId, h.SelectedText, h.NoteText, h.AnchorJson })
            .ToListAsync(ct);

        return rows
            // Present oldest-first (reverse the newest-first DB take) so context reads in reading order.
            .AsEnumerable()
            .Reverse()
            .Select(h => new PrivateNote(
                h.UserChapterId, 0, "highlight",
                BuildHighlightText(h.SelectedText, h.NoteText, h.AnchorJson)))
            .ToList();
    }

    /// <summary>
    /// Renders a user-book highlight as context text: the selection plus its inline note, prefixed with the
    /// PDF page when the anchor is page-anchored (<c>kind:"pdf"</c>) and a page is present. Pure — unit-tested.
    /// </summary>
    public static string BuildHighlightText(string selectedText, string? noteText, string? anchorJson)
    {
        var body = RagContextService.HighlightToText(selectedText, noteText);
        var page = ExtractPdfPage(anchorJson);
        return page is { } p ? $"p.{p}: {body}" : body;
    }

    /// <summary>The 1-based page from a PDF highlight anchor (<c>{ kind:"pdf", page:N, … }</c>), else null.</summary>
    public static int? ExtractPdfPage(string? anchorJson)
    {
        if (string.IsNullOrWhiteSpace(anchorJson))
            return null;
        try
        {
            using var doc = JsonDocument.Parse(anchorJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return null;
            if (!root.TryGetProperty("kind", out var kind) || kind.GetString() != "pdf")
                return null;
            if (root.TryGetProperty("page", out var page) && page.TryGetInt32(out var p) && p > 0)
                return p;
            return null;
        }
        catch
        {
            return null;
        }
    }
}

/// <summary>
/// Retrieval context for one user + their uploaded book: chunks plus the user's own highlights on the book
/// as guaranteed private context (<see cref="Notes"/>).
/// </summary>
public record UserBookRagContext(
    IReadOnlyList<RetrievedChunk> Chunks,
    IReadOnlyList<PrivateNote> Notes);
