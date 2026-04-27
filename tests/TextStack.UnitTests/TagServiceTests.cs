using Application.UserBooks;

namespace TextStack.UnitTests;

public class TagServiceTests
{
    [Fact]
    public void Normalize_Lowercases_Trims_HyphenatesSpaces()
    {
        Assert.Equal("my-favorites", TagService.Normalize(" My Favorites "));
        Assert.Equal("sci-fi", TagService.Normalize("Sci-Fi!@#"));
        Assert.Equal("foo-bar-baz", TagService.Normalize("foo  bar\tbaz"));
        Assert.Equal("", TagService.Normalize("   "));
    }

    [Fact]
    public void NormalizeAll_DedupesAndTruncates()
    {
        var input = new[] { "Fantasy", "fantasy", "FANTASY", "classic", "" };
        var result = TagService.NormalizeAll(input);
        Assert.Equal(2, result.Length);
        Assert.Contains("fantasy", result);
        Assert.Contains("classic", result);
    }

    [Fact]
    public void NormalizeAll_EnforcesMax20()
    {
        var input = Enumerable.Range(0, 30).Select(i => $"tag{i}");
        var result = TagService.NormalizeAll(input);
        Assert.Equal(TagService.MaxTagsPerBook, result.Length);
    }

    [Fact]
    public void Normalize_TruncatesAtMaxLength()
    {
        var longTag = new string('a', TagService.MaxTagLength + 50);
        var result = TagService.Normalize(longTag);
        Assert.Equal(TagService.MaxTagLength, result.Length);
    }
}
