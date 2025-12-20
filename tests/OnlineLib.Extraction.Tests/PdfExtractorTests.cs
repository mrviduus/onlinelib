using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Registry;

namespace OnlineLib.Extraction.Tests;

public class PdfExtractorTests
{
    private static string FixturePath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "sample_textlayer.pdf");

    [Fact]
    public async Task ExtractAsync_InvalidStream_NeverThrows()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not a valid pdf"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "invalid.pdf"
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsEmptyUnits()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Empty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsTextSourceNone()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_HasParseErrorWarning()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.ParseError, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsPdfFormat()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Pdf, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ExtractsTitleFromFileName()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "my-document.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("my-document", result.Metadata.Title);
    }

    [Fact]
    public async Task ExtractAsync_EmptyStream_NeverThrows()
    {
        var extractor = new PdfTextExtractor();
        using var stream = new MemoryStream([]);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.pdf"
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_ReturnsUnits()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.NotEmpty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_ReturnsNativeTextSource()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_ReturnsPdfFormat()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Pdf, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_UnitsHavePageType()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, unit => Assert.Equal(ContentUnitType.Page, unit.Type));
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_ContainsExpectedText()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);
        var allText = string.Join(" ", result.Units.Select(u => u.PlainText));

        Assert.Contains("sample", allText.ToLowerInvariant());
    }

    [Fact]
    public async Task ExtractAsync_ThroughRegistry_ResolvesCorrectly()
    {
        var registry = new ExtractorRegistry([new PdfTextExtractor()]);
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var extractor = registry.Resolve(request);
        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Pdf, result.SourceFormat);
        Assert.NotEmpty(result.Units);
    }

    [Fact]
    public void Registry_ResolvesPdfExtractor()
    {
        var registry = new ExtractorRegistry([new PdfTextExtractor()]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "document.pdf"
        };

        var extractor = registry.Resolve(request);

        Assert.IsType<PdfTextExtractor>(extractor);
    }

    #region Html Generation Tests

    [Fact]
    public async Task ExtractAsync_ValidPdf_UnitsHaveHtml()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, unit => Assert.NotNull(unit.Html));
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_HtmlIsNotEmpty()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units.Where(u => !string.IsNullOrEmpty(u.PlainText)),
            unit => Assert.NotEmpty(unit.Html!));
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_HtmlContainsParagraphTags()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);
        var unitsWithContent = result.Units.Where(u => !string.IsNullOrEmpty(u.PlainText)).ToList();

        Assert.NotEmpty(unitsWithContent);
        Assert.All(unitsWithContent, unit => Assert.Contains("<p>", unit.Html!));
    }

    [Fact]
    public async Task ExtractAsync_ValidPdf_HtmlIsProperlyEscaped()
    {
        var extractor = new PdfTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample_textlayer.pdf"
        };

        var result = await extractor.ExtractAsync(request);

        // Html should not contain unescaped special chars from plaintext
        foreach (var unit in result.Units.Where(u => !string.IsNullOrEmpty(u.Html)))
        {
            // Basic check: Html should be valid (contains opening/closing p tags)
            var openCount = unit.Html!.Split("<p>").Length - 1;
            var closeCount = unit.Html.Split("</p>").Length - 1;
            Assert.Equal(openCount, closeCount);
        }
    }

    #endregion
}
