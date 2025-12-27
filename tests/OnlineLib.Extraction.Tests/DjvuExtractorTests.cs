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

    private static string FixturePath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "sample.djvu");

    private static bool DjvuToolsAvailable()
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "djvutxt",
                Arguments = "--help",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = System.Diagnostics.Process.Start(psi);
            p?.WaitForExit(1000);
            return true;
        }
        catch
        {
            return false;
        }
    }

    [Fact]
    public async Task ExtractAsync_ValidDjvu_ReturnsUnits()
    {
        if (!File.Exists(FixturePath))
            return;

        var extractor = new DjvuTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.djvu"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Djvu, result.SourceFormat);
        Assert.NotNull(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_ValidDjvu_HtmlIsNotNull()
    {
        if (!File.Exists(FixturePath))
            return;

        var extractor = new DjvuTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.djvu"
        };

        var result = await extractor.ExtractAsync(request);

        foreach (var unit in result.Units)
        {
            Assert.NotNull(unit.Html);
        }
    }

    [Fact]
    public async Task ExtractAsync_ValidDjvu_WithDjvuLibre_ReturnsNonEmptyUnits()
    {
        if (!File.Exists(FixturePath) || !DjvuToolsAvailable())
            return;

        var extractor = new DjvuTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.djvu"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.NotEmpty(result.Units);
        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_ValidDjvu_WithDjvuLibre_HtmlContainsParagraphTags()
    {
        if (!File.Exists(FixturePath) || !DjvuToolsAvailable())
            return;

        var extractor = new DjvuTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.djvu"
        };

        var result = await extractor.ExtractAsync(request);
        var unitsWithContent = result.Units.Where(u => !string.IsNullOrEmpty(u.PlainText)).ToList();

        if (unitsWithContent.Count > 0)
        {
            Assert.All(unitsWithContent, unit => Assert.Contains("<p>", unit.Html!));
        }
    }

    [Fact]
    public async Task ExtractAsync_ValidDjvu_WithDjvuLibre_HtmlMatchesPlainText()
    {
        if (!File.Exists(FixturePath) || !DjvuToolsAvailable())
            return;

        var extractor = new DjvuTextExtractor();
        await using var stream = File.OpenRead(FixturePath);

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "sample.djvu"
        };

        var result = await extractor.ExtractAsync(request);

        foreach (var unit in result.Units.Where(u => !string.IsNullOrEmpty(u.PlainText)))
        {
            // Html should contain the same text content (escaped)
            var plainTextWords = unit.PlainText!.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(3);
            foreach (var word in plainTextWords)
            {
                var escapedWord = System.Net.WebUtility.HtmlEncode(word);
                Assert.Contains(escapedWord, unit.Html!);
            }
        }
    }

    #endregion
}
