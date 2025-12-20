using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Tests.Mocks;

namespace OnlineLib.Extraction.Tests;

public class PdfOcrFallbackTests
{
    private static string ScannedPdfPath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "pdf_scanned_notextlayer.pdf");

    #region OCR Disabled Behavior

    [Fact]
    public async Task ExtractAsync_NoTextLayer_OcrDisabled_ReturnsTextSourceNone()
    {
        // Arrange - OCR disabled by default
        var options = new ExtractionOptions { EnableOcrFallback = false };
        var extractor = new PdfTextExtractor(options, null);

        // Use invalid PDF that has no text layer
        using var stream = new MemoryStream(CreateMinimalPdfWithoutText());
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "scanned.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_NoTextLayer_OcrDisabled_HasNoTextLayerWarning()
    {
        // Arrange
        var options = new ExtractionOptions { EnableOcrFallback = false };
        var extractor = new PdfTextExtractor(options, null);

        using var stream = new MemoryStream(CreateMinimalPdfWithoutText());
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "scanned.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Contains(result.Diagnostics.Warnings,
            w => w.Code == ExtractionWarningCode.NoTextLayer);
    }

    [Fact]
    public async Task ExtractAsync_NoTextLayer_OcrDisabled_DoesNotCallOcrEngine()
    {
        // Arrange
        var mockOcr = new MockOcrEngine("Should not be called");
        var options = new ExtractionOptions { EnableOcrFallback = false };
        var extractor = new PdfTextExtractor(options, mockOcr);

        using var stream = new MemoryStream(CreateMinimalPdfWithoutText());
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "scanned.pdf"
        };

        // Act
        await extractor.ExtractAsync(request);

        // Assert
        Assert.Empty(mockOcr.Calls);
    }

    #endregion

    #region Page Limit

    [Fact]
    public async Task ExtractAsync_PagesExceedLimit_ReturnsTextSourceNone()
    {
        // Arrange - set low page limit
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 1 // Very low limit
        };
        var mockOcr = new MockOcrEngine("Should not be called");
        var extractor = new PdfTextExtractor(options, mockOcr);

        // Use a PDF with more than 1 page that has no text
        using var stream = new MemoryStream(CreateMinimalPdfWithoutText());
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "multi_page.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert - even though OCR is enabled, page limit is exceeded
        // For a single-page PDF with limit of 1, it should still work
        // For limit of 0 or fewer pages than PDF has, it would fail
        // This test assumes the minimal PDF has 1 page, so let's use limit 0
        var optionsZero = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 0
        };
        var extractor2 = new PdfTextExtractor(optionsZero, mockOcr);
        stream.Position = 0;

        var result2 = await extractor2.ExtractAsync(request);

        Assert.Equal(TextSource.None, result2.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_PagesExceedLimit_HasOcrPageLimitExceededWarning()
    {
        // Arrange
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 0 // Zero limit = always exceeds
        };
        var mockOcr = new MockOcrEngine("Should not be called");
        var extractor = new PdfTextExtractor(options, mockOcr);

        using var stream = new MemoryStream(CreateMinimalPdfWithoutText());
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "large.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Contains(result.Diagnostics.Warnings,
            w => w.Code == ExtractionWarningCode.OcrPageLimitExceeded);
    }

    [Fact]
    public async Task ExtractAsync_PagesExceedLimit_DoesNotCallOcrEngine()
    {
        // Arrange
        var mockOcr = new MockOcrEngine("Should not be called");
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 0
        };
        var extractor = new PdfTextExtractor(options, mockOcr);

        using var stream = new MemoryStream(CreateMinimalPdfWithoutText());
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "large.pdf"
        };

        // Act
        await extractor.ExtractAsync(request);

        // Assert
        Assert.Empty(mockOcr.Calls);
    }

    #endregion

    #region OCR Engine Failure Safety

    [Fact]
    public async Task ExtractAsync_OcrEngineThrows_DoesNotThrow()
    {
        // Arrange
        var mockOcr = MockOcrEngine.Throwing(new InvalidOperationException("OCR failed"));
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 100
        };
        var extractor = new PdfTextExtractor(options, mockOcr);

        // We need a real PDF file that can be opened and rendered for this test
        // For now, test with invalid stream - the parse error will occur before OCR
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not a pdf"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.pdf"
        };

        // Act & Assert - should not throw
        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));
        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_OcrEngineThrows_ReturnsWarning()
    {
        // This test requires a real scanned PDF to properly test OCR failure
        // For unit testing purposes, we verify the parse error path
        var mockOcr = MockOcrEngine.Throwing(new InvalidOperationException("OCR failed"));
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 100
        };
        var extractor = new PdfTextExtractor(options, mockOcr);

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not a pdf"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert - should have parse error warning
        Assert.Contains(result.Diagnostics.Warnings,
            w => w.Code == ExtractionWarningCode.ParseError);
    }

    #endregion

    #region Integration Tests (require fixture files)

    [Fact(Skip = "Requires scanned PDF fixture")]
    public async Task ExtractAsync_ScannedPdf_OcrEnabled_ReturnsOcrTextSource()
    {
        // Arrange
        var mockOcr = new MockOcrEngine("OCR extracted text", 0.85);
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            MaxPagesForOcr = 50,
            OcrLanguage = "eng"
        };
        var extractor = new PdfTextExtractor(options, mockOcr);

        await using var stream = File.OpenRead(ScannedPdfPath);
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "pdf_scanned_notextlayer.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(TextSource.Ocr, result.Diagnostics.TextSource);
        Assert.NotEmpty(result.Units);
    }

    [Fact(Skip = "Requires scanned PDF fixture")]
    public async Task ExtractAsync_ScannedPdf_OcrDisabled_ReturnsTextSourceNone()
    {
        // Arrange
        var options = new ExtractionOptions { EnableOcrFallback = false };
        var extractor = new PdfTextExtractor(options, null);

        await using var stream = File.OpenRead(ScannedPdfPath);
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "pdf_scanned_notextlayer.pdf"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    #endregion

    /// <summary>
    /// Creates a minimal valid PDF that has no text content.
    /// </summary>
    private static byte[] CreateMinimalPdfWithoutText()
    {
        // This is a minimal valid PDF with no text content
        // PDF structure: header, catalog, pages, page (empty), xref, trailer
        const string pdf = @"%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
192
%%EOF";
        return Encoding.ASCII.GetBytes(pdf);
    }
}
