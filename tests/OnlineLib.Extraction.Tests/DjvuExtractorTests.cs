using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Registry;
using OnlineLib.Extraction.Tests.Mocks;

namespace OnlineLib.Extraction.Tests;

public class DjvuExtractorTests
{
    #region Basic Behavior

    [Fact]
    public async Task ExtractAsync_InvalidStream_NeverThrows()
    {
        // Arrange
        var extractor = new DjvuTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not a valid djvu"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "invalid.djvu"
        };

        // Act & Assert
        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));
        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ReturnsDjvuFormat()
    {
        // Arrange
        var extractor = new DjvuTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.djvu"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(SourceFormat.Djvu, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_ExtractsTitleFromFileName()
    {
        // Arrange
        var extractor = new DjvuTextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage data"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "my-document.djvu"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal("my-document", result.Metadata.Title);
    }

    [Fact]
    public async Task ExtractAsync_EmptyStream_NeverThrows()
    {
        // Arrange
        var extractor = new DjvuTextExtractor();
        using var stream = new MemoryStream([]);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "empty.djvu"
        };

        // Act & Assert
        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));
        Assert.Null(exception);
    }

    #endregion

    #region OCR Disabled Behavior

    [Fact]
    public async Task ExtractAsync_NoNativeText_OcrDisabled_ReturnsTextSourceNone()
    {
        // Arrange
        var options = new ExtractionOptions { EnableOcrFallback = false };
        // Use path to non-existent djvutxt to simulate unavailable tool
        var extractor = new DjvuTextExtractor(options, null, "/nonexistent/djvutxt");

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("fake djvu content"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "scanned.djvu"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_NoNativeText_OcrDisabled_HasNoTextLayerWarning()
    {
        // Arrange
        var options = new ExtractionOptions { EnableOcrFallback = false };
        var extractor = new DjvuTextExtractor(options, null, "/nonexistent/djvutxt");

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("fake djvu content"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "scanned.djvu"
        };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Contains(result.Diagnostics.Warnings,
            w => w.Code == ExtractionWarningCode.NoTextLayer);
    }

    [Fact]
    public async Task ExtractAsync_NoNativeText_OcrDisabled_DoesNotCallOcrEngine()
    {
        // Arrange
        var mockOcr = new MockOcrEngine("Should not be called");
        var options = new ExtractionOptions { EnableOcrFallback = false };
        var extractor = new DjvuTextExtractor(options, mockOcr, "/nonexistent/djvutxt");

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("fake djvu content"));
        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "scanned.djvu"
        };

        // Act
        await extractor.ExtractAsync(request);

        // Assert
        Assert.Empty(mockOcr.Calls);
    }

    #endregion

    #region Registry Integration

    [Fact]
    public void Registry_ResolvesDjvuExtractor()
    {
        // Arrange
        var registry = new ExtractorRegistry([new DjvuTextExtractor()]);

        var request = new ExtractionRequest
        {
            Content = Stream.Null,
            FileName = "document.djvu"
        };

        // Act
        var extractor = registry.Resolve(request);

        // Assert
        Assert.IsType<DjvuTextExtractor>(extractor);
    }

    [Fact]
    public void SupportedFormat_ReturnsDjvu()
    {
        // Arrange
        var extractor = new DjvuTextExtractor();

        // Assert
        Assert.Equal(SourceFormat.Djvu, extractor.SupportedFormat);
    }

    #endregion

    #region Integration Tests (require DjVuLibre and fixture files)

    [Fact(Skip = "Requires DJVU fixture and DjVuLibre tools")]
    public async Task ExtractAsync_ValidDjvu_WithTextLayer_ReturnsNativeText()
    {
        // This test would require a real DJVU file with embedded text
        // and DjVuLibre tools (djvutxt) installed on the system
        await Task.CompletedTask;
    }

    [Fact(Skip = "Requires DJVU fixture and DjVuLibre tools")]
    public async Task ExtractAsync_ScannedDjvu_OcrEnabled_ReturnsOcrTextSource()
    {
        // This test would require:
        // 1. A scanned DJVU file without text layer
        // 2. DjVuLibre tools (ddjvu for rendering)
        // 3. Tesseract or mock OCR engine
        await Task.CompletedTask;
    }

    #endregion
}
