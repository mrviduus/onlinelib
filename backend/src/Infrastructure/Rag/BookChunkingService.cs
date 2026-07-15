using Application.Ai;
using Application.Rag;
using Domain.Entities;
using Domain.Enums;
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
///
/// ADR-012 S3: for user-uploaded PDFs the chunks come from a vision-LLM Markdown parse
/// (<see cref="IPdfVisionParser"/> + <see cref="MarkdownChunker"/>) instead of the deterministic,
/// table-jumbling text — with page + section provenance. EPUB and any vision failure keep the
/// deterministic sentence chunker over <c>UserChapter.PlainText</c>.
/// </summary>
public sealed class BookChunkingService(
    IChunker chunker,
    MarkdownChunker markdownChunker,
    IPdfVisionParser pdfVisionParser,
    ChapterSummarizer summarizer,
    ILogger<BookChunkingService> logger)
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
                .Select(c => new { c.Id, c.ChapterNumber, c.Title, c.PlainText })
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

            // "S2": one whole-chapter summary chunk per chapter (best-effort, additive, its own SaveChanges
            // — never fails the run; the returned total includes summaries so the count stamp stays correct).
            var summaryCount = await AppendEditionSummariesAsync(
                db, editionId,
                chapters.Select(c => (c.Id, c.ChapterNumber, c.Title, c.PlainText)).ToList(),
                rows, ct);

            return rows.Count + summaryCount;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "RAG chunking failed for edition {EditionId}; chunks can be regenerated on reprocess", editionId);
            return 0;
        }
    }

    /// <summary>
    /// Phase 2: creates <see cref="UserChapterChunk"/> rows for every chapter of a USER-uploaded book
    /// (<paramref name="userBookId"/>) into the isolated <c>user_chapter_chunk</c> table. Each row
    /// carries the denormalized <see cref="UserChapterChunk.UserId"/> (the book's owner) so retrieval
    /// can hard-filter per user. Best-effort like <see cref="ChunkEditionAsync"/>: logs and returns 0
    /// on failure. Returns the total chunk count.
    /// </summary>
    public async Task<int> ChunkUserBookAsync(AppDbContext db, Guid userBookId, CancellationToken ct)
    {
        try
        {
            var ownerId = await db.UserBooks
                .Where(b => b.Id == userBookId)
                .Select(b => b.UserId)
                .FirstOrDefaultAsync(ct);

            if (ownerId == Guid.Empty)
            {
                logger.LogWarning("RAG chunking: user book {UserBookId} not found", userBookId);
                return 0;
            }

            // ADR-012 S3: a user PDF is chunked from a vision-Markdown parse (faithful tables + page
            // provenance). EPUB — and any vision failure — falls through to the deterministic path.
            var file = await db.UserBookFiles
                .Where(f => f.UserBookId == userBookId)
                .OrderByDescending(f => f.UploadedAt)
                .Select(f => new { f.Format, f.StoragePath })
                .FirstOrDefaultAsync(ct);

            var rows = file?.Format == BookFormat.Pdf
                ? await BuildPdfRowsAsync(db, userBookId, ownerId, file.StoragePath, ct)
                : null;

            if (rows is null || rows.Count == 0)
            {
                var chapters = await db.UserChapters
                    .Where(c => c.UserBookId == userBookId)
                    .OrderBy(c => c.ChapterNumber)
                    .Select(c => new { c.Id, c.ChapterNumber, c.PlainText })
                    .ToListAsync(ct);

                rows = BuildUserRows(
                    chunker, userBookId, ownerId,
                    chapters.Select(c => (c.Id, c.ChapterNumber, (string?)c.PlainText)));
            }

            if (rows.Count > 0)
            {
                db.UserChapterChunks.AddRange(rows);
                await db.SaveChangesAsync(ct);
                logger.LogInformation(
                    "Created {Count} RAG chunks for user book {UserBookId}", rows.Count, userBookId);
            }

            // "S2": one whole-chapter summary chunk per chapter, ALWAYS sourced from UserChapter.PlainText
            // (EPUB and PDF alike — independent of whether the body chunks came from the vision path).
            // Best-effort + additive; the returned total includes summaries so the count stamp stays correct.
            var summaryCount = await AppendUserBookSummariesAsync(db, userBookId, ownerId, rows, ct);

            return rows.Count + summaryCount;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "RAG chunking failed for user book {UserBookId}; chunks can be regenerated on retrigger", userBookId);
            return 0;
        }
    }

    /// <summary>
    /// "S2" summary pass for a catalog edition: one <see cref="ChapterChunk"/> with <c>is_summary=true</c>
    /// per non-empty chapter, text = <see cref="ChapterSummaryPrompt.BuildSummaryChunkText"/> over an LLM
    /// digest of the chapter. Fully self-contained and NON-THROWING — a per-chapter LLM failure/timeout is
    /// logged and skipped, and any wider failure returns 0 rather than bubbling into the caller's chunk
    /// try/catch (which would strand the already-saved body chunks as "no chunks"). Its own SaveChanges, so
    /// the body chunks are already durable. Returns the number of summary rows actually persisted.
    /// </summary>
    private async Task<int> AppendEditionSummariesAsync(
        AppDbContext db, Guid editionId,
        IReadOnlyList<(Guid Id, int Number, string Title, string PlainText)> chapters,
        IReadOnlyList<ChapterChunk> bodyRows, CancellationToken ct)
    {
        try
        {
            // Summary ord = the chapter's body-chunk count (so it sorts after them within the chapter).
            var ordByChapter = bodyRows
                .GroupBy(r => r.ChapterId)
                .ToDictionary(g => g.Key, g => g.Count());

            var summaryRows = new List<ChapterChunk>();
            var considered = 0;
            foreach (var ch in chapters)
            {
                if (ct.IsCancellationRequested) break;
                if (string.IsNullOrWhiteSpace(ch.PlainText)) continue;
                if (considered >= ChapterSummaryPrompt.MaxChaptersToSummarize)
                {
                    logger.LogInformation(
                        "Edition {EditionId} exceeds the {Cap}-chapter summary cap; summarizing the first {Cap} only",
                        editionId, ChapterSummaryPrompt.MaxChaptersToSummarize,
                        ChapterSummaryPrompt.MaxChaptersToSummarize);
                    break;
                }
                considered++;

                string summary;
                try
                {
                    summary = await summarizer.SummarizeAsync(ch.PlainText, ct);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex,
                        "Chapter summary failed for edition {EditionId} chapter {ChapterNumber}; skipping (best-effort)",
                        editionId, ch.Number);
                    continue;
                }

                if (string.IsNullOrWhiteSpace(summary)) continue;

                summaryRows.Add(new ChapterChunk
                {
                    Id = Guid.NewGuid(),
                    EditionId = editionId,
                    ChapterId = ch.Id,
                    ChapterOrd = ch.Number,
                    Ord = ordByChapter.GetValueOrDefault(ch.Id, 0),
                    Text = ChapterSummaryPrompt.BuildSummaryChunkText(ch.Number, ch.Title, summary),
                    TokenCount = 0,
                    CharStart = 0,
                    CharEnd = 0,
                    IsSummary = true,
                    Embedding = null
                });
            }

            if (summaryRows.Count == 0) return 0;

            db.ChapterChunks.AddRange(summaryRows);
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "Created {Count} chapter summaries for edition {EditionId}", summaryRows.Count, editionId);
            return summaryRows.Count;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Summary pass failed for edition {EditionId}; indexing continues without summaries", editionId);
            return 0;
        }
    }

    /// <summary>
    /// "S2" summary pass for a USER book: mirror of <see cref="AppendEditionSummariesAsync"/> over the
    /// isolated <c>user_chapter_chunk</c> table. Summaries are ALWAYS sourced from
    /// <see cref="UserChapter.PlainText"/> (EPUB and PDF alike, regardless of the body-chunk path); a PDF
    /// chapter's summary carries the chapter's <see cref="UserChapter.SourceStartPage"/> so its citation
    /// jumps to the chapter start. Non-throwing + additive like the edition pass. Returns rows persisted.
    /// </summary>
    private async Task<int> AppendUserBookSummariesAsync(
        AppDbContext db, Guid userBookId, Guid userId,
        IReadOnlyList<UserChapterChunk> bodyRows, CancellationToken ct)
    {
        try
        {
            var chapters = await db.UserChapters
                .Where(c => c.UserBookId == userBookId)
                .OrderBy(c => c.ChapterNumber)
                .Select(c => new { c.Id, c.ChapterNumber, c.Title, c.PlainText, c.SourceStartPage })
                .ToListAsync(ct);

            var ordByChapter = bodyRows
                .Where(r => r.UserChapterId != null)
                .GroupBy(r => r.UserChapterId!.Value)
                .ToDictionary(g => g.Key, g => g.Count());

            var summaryRows = new List<UserChapterChunk>();
            var considered = 0;
            foreach (var ch in chapters)
            {
                if (ct.IsCancellationRequested) break;
                if (string.IsNullOrWhiteSpace(ch.PlainText)) continue;
                if (considered >= ChapterSummaryPrompt.MaxChaptersToSummarize)
                {
                    logger.LogInformation(
                        "User book {UserBookId} exceeds the {Cap}-chapter summary cap; summarizing the first {Cap} only",
                        userBookId, ChapterSummaryPrompt.MaxChaptersToSummarize,
                        ChapterSummaryPrompt.MaxChaptersToSummarize);
                    break;
                }
                considered++;

                string summary;
                try
                {
                    summary = await summarizer.SummarizeAsync(ch.PlainText, ct);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex,
                        "Chapter summary failed for user book {UserBookId} chapter {ChapterNumber}; skipping (best-effort)",
                        userBookId, ch.ChapterNumber);
                    continue;
                }

                if (string.IsNullOrWhiteSpace(summary)) continue;

                summaryRows.Add(new UserChapterChunk
                {
                    Id = Guid.NewGuid(),
                    UserBookId = userBookId,
                    UserChapterId = ch.Id,
                    UserId = userId,
                    ChapterOrd = ch.ChapterNumber,
                    Ord = ordByChapter.GetValueOrDefault(ch.Id, 0),
                    Text = ChapterSummaryPrompt.BuildSummaryChunkText(ch.ChapterNumber, ch.Title, summary),
                    TokenCount = 0,
                    CharStart = 0,
                    CharEnd = 0,
                    SourcePage = ch.SourceStartPage,
                    SectionPath = null,
                    IsSummary = true,
                    Embedding = null
                });
            }

            if (summaryRows.Count == 0) return 0;

            db.UserChapterChunks.AddRange(summaryRows);
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "Created {Count} chapter summaries for user book {UserBookId}", summaryRows.Count, userBookId);
            return summaryRows.Count;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "Summary pass failed for user book {UserBookId}; indexing continues without summaries", userBookId);
            return 0;
        }
    }

    /// <summary>
    /// Pure mapping: user-book chapters → ordered <see cref="UserChapterChunk"/> rows (null embedding)
    /// via <paramref name="chunker"/>. Each row carries <paramref name="userId"/> (denormalized owner)
    /// + <paramref name="userBookId"/> so the per-user isolation filter works in SQL. Extracted so the
    /// row shape is unit-testable without a DB.
    /// </summary>
    public static List<UserChapterChunk> BuildUserRows(
        IChunker chunker,
        Guid userBookId,
        Guid userId,
        IEnumerable<(Guid Id, int ChapterNumber, string? PlainText)> chapters)
    {
        var rows = new List<UserChapterChunk>();
        foreach (var chapter in chapters)
        {
            foreach (var chunk in chunker.Chunk(chapter.PlainText ?? string.Empty))
            {
                rows.Add(new UserChapterChunk
                {
                    Id = Guid.NewGuid(),
                    UserBookId = userBookId,
                    UserChapterId = chapter.Id,
                    UserId = userId,
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

    /// <summary>
    /// ADR-012 S3 PDF path: vision-parse the stored PDF → structure-aware Markdown chunks → rows attached
    /// to the BOOK (UserBookId + UserId always set), each carrying its source page + section path. When
    /// S2 chapter detection has run, a chunk whose page falls inside a chapter's [SourceStartPage,
    /// SourceEndPage] is linked to that chapter; otherwise the chapter link stays null (best-effort — we
    /// never trigger chapter detection here). Returns null on vision failure/empty so the caller falls
    /// back to the deterministic chunker.
    /// </summary>
    private async Task<List<UserChapterChunk>?> BuildPdfRowsAsync(
        AppDbContext db, Guid userBookId, Guid userId, string storagePath, CancellationToken ct)
    {
        var pages = await pdfVisionParser.ParseAsync(storagePath, ct);
        if (pages.Count == 0)
        {
            logger.LogInformation(
                "Vision parse yielded no pages for user book {UserBookId}; falling back to deterministic chunking",
                userBookId);
            return null;
        }

        var chunks = markdownChunker.Chunk(pages);
        if (chunks.Count == 0)
            return null;

        var chapters = await db.UserChapters
            .Where(c => c.UserBookId == userBookId && c.SourceStartPage != null && c.SourceEndPage != null)
            .OrderBy(c => c.ChapterNumber)
            .Select(c => new { c.Id, c.ChapterNumber, Start = c.SourceStartPage!.Value, End = c.SourceEndPage!.Value })
            .ToListAsync(ct);

        var ranges = chapters
            .Select(c => (c.Id, c.ChapterNumber, c.Start, c.End))
            .ToList();

        return BuildUserRowsFromMarkdown(userBookId, userId, chunks, ranges);
    }

    /// <summary>
    /// Pure mapping: structure-aware Markdown chunks → <see cref="UserChapterChunk"/> rows (null
    /// embedding). Every row carries the owner (<paramref name="userId"/>) + book plus the chunk's
    /// <c>SourcePage</c>/<c>SectionPath</c>. The (optional) chapter link + ChapterOrd come from the page
    /// range lookup — null/0 when no chapter contains the page. Static + pure so the page→chapter mapping
    /// is unit-testable without a DB. Char offsets are Markdown-local (never used for PDF navigation).
    /// </summary>
    public static List<UserChapterChunk> BuildUserRowsFromMarkdown(
        Guid userBookId,
        Guid userId,
        IReadOnlyList<MarkdownChunk> chunks,
        IReadOnlyList<(Guid Id, int ChapterNumber, int Start, int End)> chapters)
    {
        var rows = new List<UserChapterChunk>(chunks.Count);
        foreach (var chunk in chunks)
        {
            var chapter = FindChapterForPage(chapters, chunk.SourcePage);
            rows.Add(new UserChapterChunk
            {
                Id = Guid.NewGuid(),
                UserBookId = userBookId,
                UserChapterId = chapter?.Id,                      // null when unmapped (best-effort)
                UserId = userId,
                ChapterOrd = chapter?.ChapterNumber ?? 0,
                Ord = chunk.Ord,
                Text = chunk.Text,
                TokenCount = chunk.TokenCount,
                CharStart = chunk.CharStart,
                CharEnd = chunk.CharEnd,
                SourcePage = chunk.SourcePage,
                SectionPath = chunk.SectionPath,
                Embedding = null
            });
        }

        return rows;
    }

    /// <summary>First chapter whose physical page range contains <paramref name="page"/>, or null.</summary>
    private static (Guid Id, int ChapterNumber, int Start, int End)? FindChapterForPage(
        IReadOnlyList<(Guid Id, int ChapterNumber, int Start, int End)> chapters, int page)
    {
        foreach (var c in chapters)
            if (page >= c.Start && page <= c.End)
                return c;
        return null;
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
