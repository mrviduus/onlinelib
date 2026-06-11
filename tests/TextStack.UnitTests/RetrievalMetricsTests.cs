using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class RetrievalMetricsTests
{
    private static RetrievedChunk Chunk(int chapterOrd, string text) =>
        new(Guid.NewGuid(), Guid.NewGuid(), chapterOrd, 0, text, 0, text.Length, 0.0);

    [Fact]
    public void IsHit_RightChapterAndPhrase_True()
    {
        var retrieved = new[] { Chunk(5, "Asynchronous replication lets the leader continue.") };
        Assert.True(RetrievalMetrics.IsHit(retrieved, 5, ["asynchronous replication"]));
    }

    [Fact]
    public void IsHit_PhraseMatchIsCaseInsensitive_True()
    {
        var retrieved = new[] { Chunk(3, "An LSM-Tree merges sorted segments.") };
        Assert.True(RetrievalMetrics.IsHit(retrieved, 3, ["lsm-tree"]));
    }

    [Fact]
    public void IsHit_RightPhraseWrongChapter_False()
    {
        var retrieved = new[] { Chunk(9, "Asynchronous replication is discussed earlier.") };
        Assert.False(RetrievalMetrics.IsHit(retrieved, 5, ["asynchronous replication"]));
    }

    [Fact]
    public void IsHit_RightChapterNoPhrase_False()
    {
        var retrieved = new[] { Chunk(5, "This passage is about something unrelated.") };
        Assert.False(RetrievalMetrics.IsHit(retrieved, 5, ["asynchronous replication"]));
    }

    [Fact]
    public void Recall_CountsHittingCases()
    {
        var cases = new (IReadOnlyList<RetrievedChunk>, int, IReadOnlyList<string>)[]
        {
            (new[] { Chunk(5, "asynchronous replication") }, 5, ["asynchronous replication"]), // hit
            (new[] { Chunk(3, "lsm-tree compaction") }, 3, ["lsm-tree"]),                       // hit
            (new[] { Chunk(7, "nothing here") }, 7, ["serializable"]),                          // miss
        };
        Assert.Equal(2.0 / 3.0, RetrievalMetrics.Recall(cases), 12);
    }

    [Fact]
    public void Recall_EmptySet_VacuouslyOne()
        => Assert.Equal(1.0, RetrievalMetrics.Recall([]));

    [Fact]
    public void LeakCount_CountsChunksPastGate()
    {
        var retrieved = new[] { Chunk(3, "a"), Chunk(5, "b"), Chunk(9, "c") };
        Assert.Equal(2, RetrievalMetrics.LeakCount(retrieved, gateChapterOrd: 4)); // ords 5 and 9 leak
    }

    [Fact]
    public void LeakRate_AnyLeakMarksTheCase()
    {
        var cases = new (IReadOnlyList<RetrievedChunk>, int)[]
        {
            (new[] { Chunk(3, "a"), Chunk(9, "b") }, 5), // leaks (9 > 5)
            (new[] { Chunk(2, "c"), Chunk(4, "d") }, 5), // clean
        };
        Assert.Equal(0.5, RetrievalMetrics.LeakRate(cases), 12);
    }

    [Fact]
    public void LeakRate_NoCases_Zero()
        => Assert.Equal(0.0, RetrievalMetrics.LeakRate([]));
}
