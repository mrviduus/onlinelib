using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Registry;

namespace OnlineLib.Extraction.Tests;

public class TxtMdIntegrationTests
{
    private static string FixturesPath => Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task TxtFile_ExtractsThroughRegistry()
    {
        var registry = new ExtractorRegistry([
            new TxtTextExtractor(),
            new MdTextExtractor()
        ]);

        await using var stream = File.OpenRead(Path.Combine(FixturesPath, "sample.txt"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.txt"
        };

        var extractor = registry.Resolve(request);
        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Txt, result.SourceFormat);
        Assert.Single(result.Units);
        Assert.Contains("sample text file", result.Units[0].PlainText);
        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
        Assert.Equal("sample", result.Metadata.Title);
    }

    [Fact]
    public async Task MdFile_ExtractsThroughRegistry()
    {
        var registry = new ExtractorRegistry([
            new TxtTextExtractor(),
            new MdTextExtractor()
        ]);

        await using var stream = File.OpenRead(Path.Combine(FixturesPath, "sample.md"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.md"
        };

        var extractor = registry.Resolve(request);
        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Md, result.SourceFormat);
        Assert.Single(result.Units);
        Assert.Contains("# Sample Markdown", result.Units[0].PlainText);
        Assert.Contains("**sample**", result.Units[0].PlainText);
        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
        Assert.Equal("sample", result.Metadata.Title);
    }

    [Fact]
    public async Task EmptyTxtFile_ExtractsWithWarning()
    {
        var registry = new ExtractorRegistry([
            new TxtTextExtractor(),
            new MdTextExtractor()
        ]);

        await using var stream = File.OpenRead(Path.Combine(FixturesPath, "empty.txt"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.txt"
        };

        var extractor = registry.Resolve(request);
        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Txt, result.SourceFormat);
        Assert.Single(result.Units);
        Assert.Empty(result.Units[0].PlainText);
        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.EmptyFile, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public void Registry_ResolvesTxtExtractor()
    {
        var registry = new ExtractorRegistry([
            new TxtTextExtractor(),
            new MdTextExtractor()
        ]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "document.txt"
        };

        var extractor = registry.Resolve(request);

        Assert.IsType<TxtTextExtractor>(extractor);
    }

    [Fact]
    public void Registry_ResolvesMdExtractor()
    {
        var registry = new ExtractorRegistry([
            new TxtTextExtractor(),
            new MdTextExtractor()
        ]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "README.md"
        };

        var extractor = registry.Resolve(request);

        Assert.IsType<MdTextExtractor>(extractor);
    }
}
