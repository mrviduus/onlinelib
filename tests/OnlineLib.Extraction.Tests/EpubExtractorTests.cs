using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Registry;

namespace OnlineLib.Extraction.Tests;

public class EpubExtractorTests
{
    private static string FixturePath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "minimal.epub");

    [Fact]
    public async Task ExtractAsync_MinimalEpub_ReturnsUnits()
    {
        var extractor = new EpubTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.NotEmpty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_MinimalEpub_PlainTextNotEmpty()
    {
        var extractor = new EpubTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, unit => Assert.False(string.IsNullOrWhiteSpace(unit.PlainText)));
    }

    [Fact]
    public async Task ExtractAsync_MinimalEpub_ReturnsNativeTextSource()
    {
        var extractor = new EpubTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_MinimalEpub_ExtractsMetadata()
    {
        var extractor = new EpubTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("Minimal Test Book", result.Metadata.Title);
        Assert.Equal("Test Author", result.Metadata.Authors);
    }

    [Fact]
    public async Task ExtractAsync_MinimalEpub_ReturnsEpubFormat()
    {
        var extractor = new EpubTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Epub, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_MinimalEpub_UnitsHaveWordCount()
    {
        var extractor = new EpubTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, unit => Assert.True(unit.WordCount > 0));
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_NeverThrows()
    {
        var extractor = new EpubTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not a valid epub"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "invalid.epub"
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsEmptyUnits()
    {
        var extractor = new EpubTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Empty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsTextSourceNone()
    {
        var extractor = new EpubTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_HasParseErrorWarning()
    {
        var extractor = new EpubTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.ParseError, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsEpubFormat()
    {
        var extractor = new EpubTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.epub"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Epub, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_EmptyStream_NeverThrows()
    {
        var extractor = new EpubTextExtractor();
        using var stream = new MemoryStream([]);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.epub"
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_ThroughRegistry_ResolvesCorrectly()
    {
        var registry = new ExtractorRegistry([new EpubTextExtractor()]);
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "minimal.epub"
        };

        var extractor = registry.Resolve(request);
        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Epub, result.SourceFormat);
        Assert.NotEmpty(result.Units);
        Assert.Contains("minimal test chapter", result.Units[0].PlainText.ToLowerInvariant());
    }
}
