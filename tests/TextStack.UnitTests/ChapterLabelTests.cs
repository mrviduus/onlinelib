using Application.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// A citation is the one part of an AI answer a reader can check by hand. These pin the two ways
/// the old raw ordinal was wrong — both of which produced a checkable, checkably-wrong reference.
/// </summary>
public class ChapterLabelTests
{
    [Fact]
    public void For_UnsplitChapter_CountsFromOneLikeEveryReaderFacingSurface()
    {
        // ChapterNumber is 0-based: the parser starts at zero, the table of contents renders
        // `chapterNumber + 1`, and the reader footer renders `index + 1`. Handing the raw value to
        // a model made it say "Chapter 7" about the eighth chapter.
        Assert.Equal("Chapter 1", ChapterLabel.For(0));
        Assert.Equal("Chapter 8", ChapterLabel.For(7));
    }

    [Fact]
    public void For_SplitChapter_UsesTheBooksOwnNumber_NotThePartsPosition()
    {
        // Long chapters are cut into parts and each part gets its own sequential ChapterNumber, so
        // on a split book the ordinal is the chunk's index. The book's real number is preserved
        // separately, and it is already 1-based — no +1.
        Assert.Equal("Chapter 5 (part 2 of 3)", ChapterLabel.For(11, originalChapterNumber: 5, partNumber: 2, totalParts: 3));
    }

    [Fact]
    public void For_SingleUnsplitPart_ReadsAsAnOrdinaryChapter()
    {
        // TotalParts of 1 is not a split — saying "part 1 of 1" would be noise dressed as precision.
        Assert.Equal("Chapter 5", ChapterLabel.For(4, originalChapterNumber: 5, partNumber: 1, totalParts: 1));
    }

    [Fact]
    public void For_NoNumber_ReturnsNullSoTheFieldCanBeOmitted()
    {
        // Better an answer with no citation than an answer with an invented one.
        Assert.Null(ChapterLabel.For(null));
    }
}
