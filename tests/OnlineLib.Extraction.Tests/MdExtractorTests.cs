using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;

namespace OnlineLib.Extraction.Tests;

public class MdExtractorTests
{
    [Fact]
    public async Task ExtractAsync_ReturnsOneUnit()
    {
        var extractor = new MdTextExtractor();
        using var stream = CreateStream("# Hello World");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "readme.md"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_PreservesMarkdownSyntax()
    {
        var extractor = new MdTextExtractor();
        var markdown = "# Title\n\n**Bold** and *italic*";
        using var stream = CreateStream(markdown);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "readme.md"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Contains("# Title", result.Units[0].PlainText);
        Assert.Contains("**Bold**", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_HtmlIsGenerated()
    {
        var extractor = new MdTextExtractor();
        using var stream = CreateStream("# Hello");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "readme.md"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.NotNull(result.Units[0].Html);
        Assert.Contains("<p>", result.Units[0].Html);
    }

    [Fact]
    public async Task ExtractAsync_ExtractsTitleFromFileName()
    {
        var extractor = new MdTextExtractor();
        using var stream = CreateStream("# Hello");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "README.md"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("README", result.Metadata.Title);
    }

    private static MemoryStream CreateStream(string content)
    {
        return new MemoryStream(Encoding.UTF8.GetBytes(content));
    }
}
