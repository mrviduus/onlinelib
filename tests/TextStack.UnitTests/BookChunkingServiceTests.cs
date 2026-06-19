using Domain.Entities;
using Infrastructure.Rag;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// Phase 1 on-demand indexing: the pure chapters → <see cref="ChapterChunk"/> row mapping shared by
/// ingestion and the "Ask this book" trigger. DB persistence is exercised by integration tests; here
/// we lock the row shape (null embedding, denormalized ChapterOrd, offsets that slice back) against
/// the real <see cref="Chunker"/>.
/// </summary>
public class BookChunkingServiceTests
{
    private const string ChapterOne =
        "Alpha beta gamma delta. Epsilon zeta eta theta. Iota kappa lambda mu. " +
        "Nu xi omicron pi. Rho sigma tau upsilon.";

    [Fact]
    public void BuildRows_KnownChapters_ChunkCountMatchesChunker()
    {
        var editionId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();
        var chunker = new Chunker(maxTokens: 12, overlapTokens: 4);

        var expected = chunker.Chunk(ChapterOne).Count;
        var rows = BookChunkingService.BuildRows(
            chunker, editionId, [(chapterId, 0, ChapterOne)]);

        Assert.True(expected >= 2, "fixture must split into multiple chunks");
        Assert.Equal(expected, rows.Count);
    }

    [Fact]
    public void BuildRows_RowsCarryEditionChapterAndNullEmbedding()
    {
        var editionId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();

        var rows = BookChunkingService.BuildRows(
            new Chunker(), editionId, [(chapterId, 3, "One short sentence here.")]);

        var row = Assert.Single(rows);
        Assert.Equal(editionId, row.EditionId);
        Assert.Equal(chapterId, row.ChapterId);
        Assert.Equal(3, row.ChapterOrd);          // denormalized from chapter number
        Assert.Equal(0, row.Ord);
        Assert.Null(row.Embedding);               // filled later by the embedding worker
        Assert.True(row.TokenCount > 0);
    }

    [Fact]
    public void BuildRows_OffsetsSliceBackToChunkText()
    {
        var rows = BookChunkingService.BuildRows(
            new Chunker(maxTokens: 12, overlapTokens: 4),
            Guid.NewGuid(), [(Guid.NewGuid(), 0, ChapterOne)]);

        foreach (var r in rows)
            Assert.Equal(r.Text, ChapterOne.Substring(r.CharStart, r.CharEnd - r.CharStart));
    }

    [Fact]
    public void BuildRows_MultipleChapters_OrdResetsPerChapter()
    {
        var rows = BookChunkingService.BuildRows(
            new Chunker(maxTokens: 12, overlapTokens: 4),
            Guid.NewGuid(),
            [(Guid.NewGuid(), 0, ChapterOne), (Guid.NewGuid(), 1, ChapterOne)]);

        var byChapter = rows.GroupBy(r => r.ChapterId);
        foreach (var chapter in byChapter)
        {
            var ords = chapter.Select(r => r.Ord).ToList();
            for (var i = 0; i < ords.Count; i++)
                Assert.Equal(i, ords[i]); // 0-based, contiguous, per chapter
        }
    }

    [Fact]
    public void BuildRows_EmptyChapterText_ProducesNoRows()
    {
        var rows = BookChunkingService.BuildRows(
            new Chunker(), Guid.NewGuid(), [(Guid.NewGuid(), 0, "   ")]);

        Assert.Empty(rows);
    }

    // ----- Phase 2: user-book chunking (BuildUserRows mirrors BuildRows but isolated per user) -----

    [Fact]
    public void BuildUserRows_KnownChapters_ChunkCountMatchesChunker()
    {
        var userBookId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();
        var chunker = new Chunker(maxTokens: 12, overlapTokens: 4);

        var expected = chunker.Chunk(ChapterOne).Count;
        var rows = BookChunkingService.BuildUserRows(
            chunker, userBookId, userId, [(chapterId, 0, ChapterOne)]);

        Assert.True(expected >= 2, "fixture must split into multiple chunks");
        Assert.Equal(expected, rows.Count);
    }

    [Fact]
    public void BuildUserRows_RowsCarryUserIdBookIdChapterAndNullEmbedding()
    {
        var userBookId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var chapterId = Guid.NewGuid();

        var rows = BookChunkingService.BuildUserRows(
            new Chunker(), userBookId, userId, [(chapterId, 3, "One short sentence here.")]);

        var row = Assert.Single(rows);
        // The denormalized owner id is the isolation boundary — it MUST be stamped on every row.
        Assert.Equal(userId, row.UserId);
        Assert.Equal(userBookId, row.UserBookId);
        Assert.Equal(chapterId, row.UserChapterId);
        Assert.Equal(3, row.ChapterOrd);          // denormalized from chapter number
        Assert.Equal(0, row.Ord);
        Assert.Null(row.Embedding);               // filled later by the embedding worker
        Assert.True(row.TokenCount > 0);
    }

    [Fact]
    public void BuildUserRows_AllRowsCarrySameUserAndBook()
    {
        var userBookId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var rows = BookChunkingService.BuildUserRows(
            new Chunker(maxTokens: 12, overlapTokens: 4),
            userBookId, userId,
            [(Guid.NewGuid(), 0, ChapterOne), (Guid.NewGuid(), 1, ChapterOne)]);

        Assert.NotEmpty(rows);
        Assert.All(rows, r => Assert.Equal(userId, r.UserId));
        Assert.All(rows, r => Assert.Equal(userBookId, r.UserBookId));
    }

    [Fact]
    public void BuildUserRows_OffsetsSliceBackToChunkText()
    {
        var rows = BookChunkingService.BuildUserRows(
            new Chunker(maxTokens: 12, overlapTokens: 4),
            Guid.NewGuid(), Guid.NewGuid(), [(Guid.NewGuid(), 0, ChapterOne)]);

        foreach (var r in rows)
            Assert.Equal(r.Text, ChapterOne.Substring(r.CharStart, r.CharEnd - r.CharStart));
    }

    [Fact]
    public void BuildUserRows_EmptyChapterText_ProducesNoRows()
    {
        var rows = BookChunkingService.BuildUserRows(
            new Chunker(), Guid.NewGuid(), Guid.NewGuid(), [(Guid.NewGuid(), 0, "   ")]);

        Assert.Empty(rows);
    }
}
