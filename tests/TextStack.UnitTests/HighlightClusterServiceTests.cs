using Application.Highlights;

namespace TextStack.UnitTests;

public class HighlightClusterServiceTests
{
    [Theory]
    [InlineData("hello world", "hello world")]
    [InlineData("  hello  world  ", "hello world")]
    [InlineData("Hello World", "hello world")]
    [InlineData("hello\tworld", "hello world")]
    [InlineData("hello\nworld", "hello world")]
    [InlineData("\"Hello world!\"", "hello world")]
    [InlineData("…hello world…", "hello world")]
    public void NormalizeKey_CollapsesWhitespaceLowercasesAndStripsEdgePunctuation(string input, string expected)
    {
        Assert.Equal(expected, HighlightClusterService.NormalizeKey(input));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("...")]
    [InlineData("!?!")]
    public void NormalizeKey_ReturnsEmptyForBlankOrPunctuationOnly(string input)
    {
        Assert.Equal(string.Empty, HighlightClusterService.NormalizeKey(input));
    }

    [Fact]
    public void NormalizeKey_PreservesInteriorPunctuation()
    {
        Assert.Equal("it's a well-known fact", HighlightClusterService.NormalizeKey("It's a well-known fact"));
    }

    [Fact]
    public void NormalizeKey_IsIdempotent()
    {
        var once = HighlightClusterService.NormalizeKey("  \"Hello, World!\"  ");
        var twice = HighlightClusterService.NormalizeKey(once);
        Assert.Equal(once, twice);
    }

    [Fact]
    public void NormalizeKey_UnicodeLowercasesAndPreserves()
    {
        Assert.Equal("привет мир", HighlightClusterService.NormalizeKey("  ПРИВЕТ  МИР!  "));
    }
}
