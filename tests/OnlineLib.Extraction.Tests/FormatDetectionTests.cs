using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Registry;

namespace OnlineLib.Extraction.Tests;

public class FormatDetectionTests
{
    private readonly ExtractorRegistry _registry = new([]);

    [Theory]
    [InlineData("book.txt", SourceFormat.Txt)]
    [InlineData("book.TXT", SourceFormat.Txt)]
    [InlineData("readme.md", SourceFormat.Md)]
    [InlineData("README.MD", SourceFormat.Md)]
    [InlineData("novel.epub", SourceFormat.Epub)]
    [InlineData("Novel.EPUB", SourceFormat.Epub)]
    [InlineData("document.pdf", SourceFormat.Pdf)]
    [InlineData("document.PDF", SourceFormat.Pdf)]
    [InlineData("book.fb2", SourceFormat.Fb2)]
    [InlineData("book.FB2", SourceFormat.Fb2)]
    [InlineData("scan.djvu", SourceFormat.Djvu)]
    [InlineData("scan.DJVU", SourceFormat.Djvu)]
    public void DetectFormat_KnownExtension_ReturnsCorrectFormat(string fileName, SourceFormat expected)
    {
        var request = CreateRequest(fileName);
        var result = _registry.DetectFormat(request);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("file.unknown")]
    [InlineData("file.xyz")]
    [InlineData("noextension")]
    [InlineData("")]
    public void DetectFormat_UnknownExtension_ReturnsUnknown(string fileName)
    {
        var request = CreateRequest(fileName);
        var result = _registry.DetectFormat(request);
        Assert.Equal(SourceFormat.Unknown, result);
    }

    private static ExtractionRequest CreateRequest(string fileName)
    {
        return new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = fileName
        };
    }
}
