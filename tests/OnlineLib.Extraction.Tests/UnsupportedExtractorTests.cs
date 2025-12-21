using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;

namespace OnlineLib.Extraction.Tests;

public class UnsupportedExtractorTests
{
    [Fact]
    public async Task ExtractAsync_ReturnsEmptyUnitsWithWarning()
    {
        var extractor = new UnsupportedTextExtractor();
        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "unknown.xyz"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Empty(result.Units);
        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
        Assert.Equal(SourceFormat.Unknown, result.SourceFormat);
        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.UnsupportedFormat, result.Diagnostics.Warnings[0].Code);
    }
}
