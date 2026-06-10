using Application.Library;

namespace TextStack.UnitTests;

public class BookProgressCalculatorTests
{
    [Fact]
    public void Compute_ChapterTwoOfTen_IsEarlyInBook_NotEightyFivePercent()
    {
        // The reported bug: 85% scroll through chapter 2 of 10 equal chapters
        // must read as ~15% of the BOOK, not 85%.
        var words = Enumerable.Repeat(100, 10).ToList();

        var pct = BookProgressCalculator.Compute(words, currentIndex: 1, chapterPercent: 0.85);

        Assert.Equal(0.185, pct, 3);
    }

    [Fact]
    public void Compute_WeightsByWordCount()
    {
        // Chapter 0 is huge (900), chapter 1 small (100). Halfway through ch1.
        var words = new List<int> { 900, 100 };

        var pct = BookProgressCalculator.Compute(words, currentIndex: 1, chapterPercent: 0.5);

        // (900 + 100*0.5) / 1000 = 0.95
        Assert.Equal(0.95, pct, 5);
    }

    [Fact]
    public void Compute_NoWordCounts_FallsBackToEqualWeight()
    {
        var words = new List<int> { 0, 0, 0, 0 };

        var pct = BookProgressCalculator.Compute(words, currentIndex: 2, chapterPercent: 0.5);

        // (2 + 0.5) / 4
        Assert.Equal(0.625, pct, 5);
    }

    [Fact]
    public void Compute_UnknownChapter_ReturnsChapterPercent()
    {
        var words = new List<int> { 100, 100 };

        var pct = BookProgressCalculator.Compute(words, currentIndex: -1, chapterPercent: 0.42);

        Assert.Equal(0.42, pct, 5);
    }

    [Fact]
    public void Compute_EmptyChapters_ReturnsClampedChapterPercent()
    {
        Assert.Equal(0.5, BookProgressCalculator.Compute(new List<int>(), 0, 0.5), 5);
        Assert.Equal(1.0, BookProgressCalculator.Compute(new List<int>(), 0, 1.7), 5);
        Assert.Equal(0.0, BookProgressCalculator.Compute(new List<int>(), 0, -1), 5);
    }

    [Fact]
    public void Compute_FirstChapterStart_IsZero()
    {
        var words = new List<int> { 100, 200, 300 };

        Assert.Equal(0.0, BookProgressCalculator.Compute(words, 0, 0.0), 5);
    }

    [Fact]
    public void Compute_LastChapterEnd_IsOne()
    {
        var words = new List<int> { 100, 200, 300 };

        Assert.Equal(1.0, BookProgressCalculator.Compute(words, 2, 1.0), 5);
    }
}
