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
///   <item><b>No private-notes corpus:</b> user books have no Notes/Highlights edition corpus, so
///   context is chunks only.</item>
///   <item><b>Per-user isolation:</b> retrieval filters on both <c>user_id</c> and
///   <c>user_book_id</c> in SQL (<see cref="IRagService.RetrieveUserBookAsync"/>).</item>
/// </list>
/// </summary>
public sealed class UserBookRagContextService(IAppDbContext db, IRagService rag)
{
    /// <summary>
    /// Resolves the user book (must be owned by <paramref name="userId"/> and not taken down) and
    /// retrieves the top <paramref name="k"/> chunks for <paramref name="query"/> over the whole book.
    /// Returns null when the book doesn't exist / isn't this user's — the caller returns 404. An
    /// owned-but-unindexed book yields an empty chunk list (→ "not enough indexed yet" answer).
    /// </summary>
    public async Task<UserBookRagContext?> BuildAsync(
        Guid userId, Guid userBookId, string query, int k, CancellationToken ct)
    {
        var owns = await db.UserBooks
            .AnyAsync(b => b.Id == userBookId && b.UserId == userId && b.TakedownAt == null, ct);
        if (!owns)
            return null;

        // Full-book retrieval (no gate). The SQL itself also filters user_id + user_book_id, so even a
        // mismatched id can't surface another user's chunks.
        var chunks = await rag.RetrieveUserBookAsync(userId, userBookId, query, k, maxChapterOrd: null, ct);
        return new UserBookRagContext(chunks);
    }
}

/// <summary>Retrieval context for one user + their uploaded book: chunks only (no private corpus).</summary>
public record UserBookRagContext(IReadOnlyList<RetrievedChunk> Chunks);
