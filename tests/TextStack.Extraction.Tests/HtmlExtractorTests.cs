using System.Text;
using TextStack.Extraction.Contracts;
using TextStack.Extraction.Enums;
using TextStack.Extraction.Extractors;

namespace TextStack.Extraction.Tests;

public class HtmlExtractorTests
{
    private static string FixturePath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "article.html");

    private static ExtractionRequest RequestFromString(string html, string fileName = "original.html")
        => new() { Content = new MemoryStream(Encoding.UTF8.GetBytes(html)), FileName = fileName };

    private static async Task<ExtractionRequest> RequestFromFixtureAsync()
    {
        var bytes = await File.ReadAllBytesAsync(FixturePath, TestContext.Current.CancellationToken);
        return new ExtractionRequest { Content = new MemoryStream(bytes), FileName = "original.html" };
    }

    [Fact]
    public async Task ExtractAsync_CleanArticle_ReturnsUnitsWithContentAndHtmlFormat()
    {
        var extractor = new HtmlTextExtractor();
        var request = await RequestFromFixtureAsync();

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(SourceFormat.Html, result.SourceFormat);
        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
        Assert.NotEmpty(result.Units);
        var unit = result.Units[0];
        Assert.False(string.IsNullOrWhiteSpace(unit.PlainText));
        Assert.True(result.Units.Sum(u => u.WordCount ?? 0) > 0);
    }

    [Fact]
    public async Task ExtractAsync_MultiSection_SplitsIntoMultipleUnits()
    {
        var extractor = new HtmlTextExtractor();
        var request = await RequestFromFixtureAsync();

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        // Fixture has an <h1> section and an <h2> section.
        Assert.True(result.Units.Count >= 2, $"expected >=2 units, got {result.Units.Count}");
    }

    [Fact]
    public async Task ExtractAsync_SingleSection_ReturnsOneUnit()
    {
        var extractor = new HtmlTextExtractor();
        const string html = "<h1>Just One</h1><p>Only a single section of prose here, no other headings.</p>";
        var request = RequestFromString(html);

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        Assert.Single(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_Metadata_ExtractsTitleAuthorDescription()
    {
        var extractor = new HtmlTextExtractor();
        var request = await RequestFromFixtureAsync();

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal("How Reading Builds Fluency", result.Metadata.Title);
        Assert.Equal("Jane Doe", result.Metadata.Authors);
        Assert.Equal("A short summary of the clipped article.", result.Metadata.Description);
    }

    [Fact]
    public async Task ExtractAsync_MaliciousHtml_StripsScriptAndHandlers()
    {
        var extractor = new HtmlTextExtractor();
        var request = await RequestFromFixtureAsync();

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        var allHtml = string.Concat(result.Units.Select(u => u.Html));
        Assert.DoesNotContain("<script", allHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onclick", allHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", allHtml, StringComparison.OrdinalIgnoreCase);
    }

    // Attacker-controlled clip HTML: each payload below survived the original
    // event-handler denylist + href-only scheme check. The stored chapter Html is
    // rendered verbatim by the web reader, so any survivor is a stored-XSS.
    [Theory]
    [InlineData("<p>x</p><iframe src=\"javascript:evil()\"></iframe>", "<iframe")]
    [InlineData("<p>x</p><object data=\"javascript:alert(1)\"></object>", "<object")]
    [InlineData("<p>x</p><embed src=\"javascript:alert(1)\">", "<embed")]
    [InlineData("<base href=\"javascript:alert(1)\"><p>x</p>", "<base")]
    [InlineData("<form action=\"javascript:alert(1)\"><button>x</button></form>", "action")]
    [InlineData("<p>x</p><img src=y onerror=alert(1)>", "onerror")]
    [InlineData("<p ontoggle=alert(1)>x</p>", "ontoggle")]
    [InlineData("<details ontoggle=alert(1) open>x</details>", "ontoggle")]
    [InlineData("<p onmouseenter=alert(1)>x</p>", "onmouseenter")]
    [InlineData("<input autofocus onfocus=alert(1)>x", "onfocus")]
    [InlineData("<button formaction=\"javascript:alert(1)\">x</button>", "formaction")]
    [InlineData("<img srcset=\"javascript:alert(1)\">x", "javascript:")]
    [InlineData("<svg><script>alert(1)</script></svg><p>x</p>", "<script")]
    [InlineData("<a href=\"java\tscript:alert(1)\">x</a>", "javascript:")]
    [InlineData("<a href=\"data:text/html,<script>alert(1)</script>\">x</a>", "data:text/html")]
    public async Task ExtractAsync_XssVector_DoesNotSurviveIntoChapterHtml(string payload, string forbidden)
    {
        var extractor = new HtmlTextExtractor();
        // Wrap with prose so a readable unit is always produced.
        var html = $"<h1>Article</h1><p>Some readable prose here for the unit.</p>{payload}";
        var request = RequestFromString(html);

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        var allHtml = string.Concat(result.Units.Select(u => u.Html));
        Assert.DoesNotContain(forbidden, allHtml, StringComparison.OrdinalIgnoreCase);
        // No event-handler attribute of any name should survive.
        Assert.DoesNotContain("onerror", allHtml, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ExtractAsync_RelativeImageSrc_IsPreservedForRewrite()
    {
        // The worker rewrites relative img src -> /api asset URLs AFTER cleaning, so the
        // sanitizer must NOT drop relative (scheme-less) src or book images break.
        var extractor = new HtmlTextExtractor();
        const string html = "<h1>Pics</h1><p>prose</p><img src=\"OEBPS/images/photo.jpg\" alt=\"x\">";
        var request = RequestFromString(html);

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        var allHtml = string.Concat(result.Units.Select(u => u.Html));
        Assert.Contains("OEBPS/images/photo.jpg", allHtml, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ExtractAsync_InvalidStream_NeverThrows()
    {
        var extractor = new HtmlTextExtractor();
        using var stream = new MemoryStream([0xFF, 0xFE, 0x00, 0x01]);
        var request = new ExtractionRequest { Content = stream, FileName = "original.html" };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request, TestContext.Current.CancellationToken));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_EmptyInput_ReturnsNoUnitsWithoutThrowing()
    {
        var extractor = new HtmlTextExtractor();
        var request = RequestFromString("");

        var result = await extractor.ExtractAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(SourceFormat.Html, result.SourceFormat);
        Assert.Empty(result.Units);
    }
}
