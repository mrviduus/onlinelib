using Domain.Entities;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Rag;

namespace Infrastructure.Rag;

/// <summary>
/// Splits an edition's chapters into RAG chunks (<see cref="ChapterChunk"/> rows with a null
/// embedding, filled later by the embedding worker). Extracted from the ingestion path so the
/// on-demand "Ask this book" index trigger (Phase 1) and ingestion share one chunking codepath.
/// Lives in Infrastructure because it touches the <c>chapter_chunk</c> DbSet directly.
/// </summary>
public sealed class BookChunkingService(IChunker chunker, ILogger<BookChunkingService> logger)
{
    /// <summary>
    /// Creates <see cref="ChapterChunk"/> rows for every chapter of <paramref name="editionId"/>
    /// using the shared <see cref="IChunker"/>, persists them (null embedding), and returns the
    /// total chunk count. Best-effort: logs and returns 0 on failure rather than throwing, so an
    /// ingestion job is never failed by a chunking hiccup. Callers that need to react to "no
    /// chunks" (the on-demand trigger) check the returned count.
    /// </summary>
    public async Task<int> ChunkEditionAsync(AppDbContext db, Guid editionId, CancellationToken ct)
    {
        try
        {
            var chapters = await db.Chapters
                .Where(c => c.EditionId == editionId)
                .OrderBy(c => c.ChapterNumber)
                .Select(c => new { c.Id, c.ChapterNumber, c.PlainText })
                .ToListAsync(ct);

            var rows = BuildRows(
                chunker, editionId,
                chapters.Select(c => (c.Id, c.ChapterNumber, (string?)c.PlainText)));

            if (rows.Count > 0)
            {
                db.ChapterChunks.AddRange(rows);
                await db.SaveChangesAsync(ct);
                logger.LogInformation(
                    "Created {Count} RAG chunks for edition {EditionId}", rows.Count, editionId);
            }

            return rows.Count;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "RAG chunking failed for edition {EditionId}; chunks can be regenerated on reprocess", editionId);
            return 0;
        }
    }

    /// <summary>
    /// Pure mapping: chapters → ordered <see cref="ChapterChunk"/> rows (null embedding) via
    /// <paramref name="chunker"/>. Extracted so the row shape (denormalized ChapterOrd, offsets,
    /// per-chapter Ord) is unit-testable without a DB. <c>ChapterOrd</c> is copied from the
    /// chapter number so the spoiler gate can filter in SQL without a chapters join.
    /// </summary>
    public static List<ChapterChunk> BuildRows(
        IChunker chunker,
        Guid editionId,
        IEnumerable<(Guid Id, int ChapterNumber, string? PlainText)> chapters)
    {
        var rows = new List<ChapterChunk>();
        foreach (var chapter in chapters)
        {
            foreach (var chunk in chunker.Chunk(chapter.PlainText ?? string.Empty))
            {
                rows.Add(new ChapterChunk
                {
                    Id = Guid.NewGuid(),
                    EditionId = editionId,
                    ChapterId = chapter.Id,
                    ChapterOrd = chapter.ChapterNumber,
                    Ord = chunk.Ord,
                    Text = chunk.Text,
                    TokenCount = chunk.TokenCount,
                    CharStart = chunk.CharStart,
                    CharEnd = chunk.CharEnd,
                    Embedding = null
                });
            }
        }

        return rows;
    }
}
