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
}
