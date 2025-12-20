using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;

namespace OnlineLib.Extraction.Tests;

public class UnsupportedExtractorTests
{
    [Fact]
    public async Task ExtractAsync_ReturnsEmptyUnits()
    {
        var extractor = new UnsupportedTextExtractor();
        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "unknown.xyz"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Empty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_ReturnsTextSourceNone()
    {
        var extractor = new UnsupportedTextExtractor();
        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "unknown.xyz"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_HasUnsupportedFormatWarning()
    {
        var extractor = new UnsupportedTextExtractor();
        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "unknown.xyz"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.UnsupportedFormat, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public async Task ExtractAsync_ReturnsSourceFormatUnknown()
    {
        var extractor = new UnsupportedTextExtractor();
        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "unknown.xyz"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Unknown, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_NeverThrows()
    {
        var extractor = new UnsupportedTextExtractor();
        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = ""
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }
}
