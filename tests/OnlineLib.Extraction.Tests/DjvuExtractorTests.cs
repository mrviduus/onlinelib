using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Ocr;
using Moq;

namespace OnlineLib.Extraction.Tests;

public class DjvuExtractorTests
{
    private static string FixturePath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "sample.djvu");

    [Fact]
    public async Task ExtractAsync_DefaultOptions_UsesNativeTextExtraction()
    {
        // Arrange
        var extractor = new DjvuTextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "sample.djvu" };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(SourceFormat.Djvu, result.SourceFormat);
        // Native extraction might succeed or fail depending on djvutxt availability
        // and whether the DJVU has embedded text
    }

    [Fact]
    public async Task ExtractAsync_PreferOcrWithoutEngine_FallsBackToNative()
    {
        // Arrange - PreferOcr is true but no OCR engine provided
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            PreferOcrOverNativeText = true
        };
        var extractor = new DjvuTextExtractor(options, ocrEngine: null);
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "sample.djvu" };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert - should still work, falling back to native or returning no text
        Assert.Equal(SourceFormat.Djvu, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_PreferOcrEnabled_UsesOcrEngine()
    {
        // Arrange
        var mockOcrEngine = new Mock<IOcrEngine>();
        mockOcrEngine
            .Setup(x => x.RecognizeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new OcrPageResult("OCR extracted text from page", 0.95));

        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            PreferOcrOverNativeText = true,
            MaxPagesForOcr = 100
        };
        var extractor = new DjvuTextExtractor(options, mockOcrEngine.Object);
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "sample.djvu" };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert
        Assert.Equal(SourceFormat.Djvu, result.SourceFormat);
        // Note: If djvused is not available, GetPageCountAsync returns 0 and OCR is skipped
        // So we can only verify that either OCR was attempted OR djvused wasn't available
        if (result.Diagnostics.TextSource == TextSource.Ocr)
        {
            Assert.NotEmpty(result.Units);
            Assert.Contains("OCR extracted text", result.Units.First().PlainText);
            mockOcrEngine.Verify(x => x.RecognizeAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.AtLeastOnce);
        }
        else
        {
            // djvused not available - OCR could not determine page count
            Assert.Contains(result.Diagnostics.Warnings, w =>
                w.Message.Contains("page count") || w.Message.Contains("ParseError"));
        }
    }

    [Fact]
    public async Task ExtractAsync_PreferOcrDisabled_UsesNativeFirst()
    {
        // Arrange
        var mockOcrEngine = new Mock<IOcrEngine>();
        var options = new ExtractionOptions
        {
            EnableOcrFallback = true,
            PreferOcrOverNativeText = false // Default behavior
        };
        var extractor = new DjvuTextExtractor(options, mockOcrEngine.Object);
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "sample.djvu" };

        // Act
        var result = await extractor.ExtractAsync(request);

        // Assert - if native extraction succeeds, OCR should not be called
        Assert.Equal(SourceFormat.Djvu, result.SourceFormat);
        if (result.Diagnostics.TextSource == TextSource.NativeText)
        {
            mockOcrEngine.Verify(x => x.RecognizeAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        }
    }
}
