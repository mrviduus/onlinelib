using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;

namespace OnlineLib.Extraction.Tests;

public class TxtExtractorTests
{
    [Fact]
    public async Task ExtractAsync_ReturnsOneUnit()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Hello World");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_ExtractsTitleFromFileName()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Hello World");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "my-document.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("my-document", result.Metadata.Title);
    }

    [Fact]
    public async Task ExtractAsync_NormalizesLineEndingsToLF()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Line1\r\nLine2\rLine3\nLine4");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("Line1\nLine2\nLine3\nLine4", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_TrimsTrailingWhitespace()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Line1   \nLine2\t\t\nLine3");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("Line1\nLine2\nLine3", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_EmptyFile_ReturnsOneUnitWithEmptyFileWarning()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Equal(string.Empty, result.Units[0].PlainText);
        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.EmptyFile, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public async Task ExtractAsync_WhitespaceOnlyFile_ReturnsEmptyFileWarning()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("   \n\t\n   ");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "whitespace.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.EmptyFile, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public async Task ExtractAsync_NeverThrowsOnEmptyFile()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.txt"
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    #region Html Generation Tests

    [Fact]
    public async Task ExtractAsync_HtmlIsGenerated()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Hello World");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.NotNull(result.Units[0].Html);
        Assert.Contains("<p>", result.Units[0].Html);
    }

    [Fact]
    public async Task ExtractAsync_HtmlContainsContent()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Hello World");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Contains("Hello World", result.Units[0].Html);
    }

    [Fact]
    public async Task ExtractAsync_HtmlEscapesSpecialChars()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("<script>alert('xss')</script>");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.DoesNotContain("<script>", result.Units[0].Html);
        Assert.Contains("&lt;script&gt;", result.Units[0].Html);
    }

    [Fact]
    public async Task ExtractAsync_HtmlPreservesLineBreaks()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("Line1\nLine2\nLine3");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Contains("<br/>", result.Units[0].Html);
    }

    [Fact]
    public async Task ExtractAsync_EmptyFile_HtmlIsEmpty()
    {
        var extractor = new TxtTextExtractor();
        using var stream = CreateStream("");

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.txt"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(string.Empty, result.Units[0].Html);
    }

    #endregion

    private static MemoryStream CreateStream(string content)
    {
        return new MemoryStream(Encoding.UTF8.GetBytes(content));
    }
}
