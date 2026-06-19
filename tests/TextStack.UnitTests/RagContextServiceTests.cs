using Application.Rag;

namespace TextStack.UnitTests;

public class RagContextServiceTests
{
    [Fact]
    public void HighlightToText_NoNote_ReturnsSelectionOnly()
        => Assert.Equal("the selected passage", RagContextService.HighlightToText("the selected passage", null));

    [Fact]
    public void HighlightToText_WithNote_AppendsNote()
        => Assert.Equal(
            "the selected passage — note: my thought",
            RagContextService.HighlightToText("the selected passage", "my thought"));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void HighlightToText_BlankNote_ReturnsSelectionOnly(string note)
        => Assert.Equal("passage", RagContextService.HighlightToText("passage", note));

    // Gate ordinal = max(persisted high-water mark, currently-open chapter ord). currentOrd is 0 when
    // the open chapter isn't part of this edition (resolved server-side), so it can't push the gate up.

    [Fact]
    public void EffectiveLastReadOrd_NoPersistedProgressOpenChapter4_Uses4()
        => Assert.Equal(4, RagContextService.EffectiveLastReadOrd(persistedLastRead: 0, currentOrd: 4));

    [Fact]
    public void EffectiveLastReadOrd_ForeignOrBogusChapter_Ignored_StaysAtPersisted()
        => Assert.Equal(0, RagContextService.EffectiveLastReadOrd(persistedLastRead: 0, currentOrd: 0));

    [Fact]
    public void EffectiveLastReadOrd_PersistedAheadOfOpenChapter_KeepsPersisted()
        => Assert.Equal(6, RagContextService.EffectiveLastReadOrd(persistedLastRead: 6, currentOrd: 2));

    [Fact]
    public void EffectiveLastReadOrd_OpenChapterAheadOfPersisted_UsesCurrent()
        => Assert.Equal(5, RagContextService.EffectiveLastReadOrd(persistedLastRead: 3, currentOrd: 5));
}
