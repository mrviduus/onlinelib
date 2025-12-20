using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Registry;

namespace OnlineLib.Extraction.Tests;

public class ExtractorRegistryTests
{
    [Fact]
    public void Resolve_EpubFile_ReturnsEpubExtractor()
    {
        var epubExtractor = new EpubTextExtractor();
        var registry = new ExtractorRegistry([epubExtractor]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "book.epub"
        };

        var result = registry.Resolve(request);

        Assert.IsType<EpubTextExtractor>(result);
    }

    [Fact]
    public void Resolve_UnknownFormat_ReturnsUnsupportedExtractor()
    {
        var epubExtractor = new EpubTextExtractor();
        var registry = new ExtractorRegistry([epubExtractor]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "file.unknown"
        };

        var result = registry.Resolve(request);

        Assert.IsType<UnsupportedTextExtractor>(result);
    }

    [Fact]
    public void Resolve_NoExtractorsRegistered_ReturnsUnsupportedExtractor()
    {
        var registry = new ExtractorRegistry([]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "book.epub"
        };

        var result = registry.Resolve(request);

        Assert.IsType<UnsupportedTextExtractor>(result);
    }
}
