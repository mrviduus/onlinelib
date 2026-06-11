using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class RrfFusionTests
{
    [Fact]
    public void Fuse_SingleList_ScoresByReciprocalRank()
    {
        var fused = RrfFusion.Fuse(new[] { new[] { "a", "b", "c" } }, k: 60);

        Assert.Equal(new[] { "a", "b", "c" }, fused.Select(f => f.Item));
        // 1-based rank: a=1/(60+1), b=1/(60+2), c=1/(60+3).
        Assert.Equal(1.0 / 61, fused[0].Score, 12);
        Assert.Equal(1.0 / 62, fused[1].Score, 12);
        Assert.Equal(1.0 / 63, fused[2].Score, 12);
    }

    [Fact]
    public void Fuse_ItemInBothLists_SumsAndOutranksSingletons()
    {
        // "b" is rank2 in list1 and rank1 in list2 → it should beat "a" (rank1, one list only).
        var fused = RrfFusion.Fuse(new[]
        {
            new[] { "a", "b" },
            new[] { "b", "c" },
        }, k: 60);

        Assert.Equal("b", fused[0].Item);
        Assert.Equal(1.0 / 62 + 1.0 / 61, fused[0].Score, 12);
    }

    [Fact]
    public void Fuse_TiedScores_KeepsFirstSeenOrder()
    {
        // Each item appears once at rank1 → equal scores; first-seen order (across lists) is stable.
        var fused = RrfFusion.Fuse(new[]
        {
            new[] { "x" },
            new[] { "y" },
            new[] { "z" },
        });

        Assert.Equal(new[] { "x", "y", "z" }, fused.Select(f => f.Item));
    }

    [Fact]
    public void Fuse_EmptyAndMissingLists_ContributeNothing()
    {
        var fused = RrfFusion.Fuse(new[]
        {
            new[] { "a" },
            Array.Empty<string>(),
        });

        Assert.Single(fused);
        Assert.Equal("a", fused[0].Item);
    }

    [Fact]
    public void Fuse_NoLists_ReturnsEmpty()
        => Assert.Empty(RrfFusion.Fuse(Array.Empty<IReadOnlyList<string>>()));
}
