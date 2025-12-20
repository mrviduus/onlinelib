using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;
using OnlineLib.Extraction.Registry;

namespace OnlineLib.Extraction.Tests;

public class Fb2ExtractorTests
{
    private const string MinimalFb2 = """
        <?xml version="1.0" encoding="utf-8"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <description>
            <title-info>
              <author>
                <first-name>John</first-name>
                <last-name>Doe</last-name>
              </author>
              <book-title>Test Book</book-title>
              <lang>en</lang>
              <annotation><p>A test book for extraction.</p></annotation>
            </title-info>
          </description>
          <body>
            <section>
              <title><p>Chapter One</p></title>
              <p>This is the first paragraph of chapter one.</p>
              <p>This is the second paragraph.</p>
            </section>
            <section>
              <title><p>Chapter Two</p></title>
              <p>Content of chapter two.</p>
            </section>
          </body>
        </FictionBook>
        """;

    private const string Fb2WithPoem = """
        <?xml version="1.0" encoding="utf-8"?>
        <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
          <description>
            <title-info>
              <book-title>Poetry Book</book-title>
            </title-info>
          </description>
          <body>
            <section>
              <title><p>A Poem</p></title>
              <poem>
                <stanza>
                  <v>Roses are red,</v>
                  <v>Violets are blue.</v>
                </stanza>
              </poem>
            </section>
          </body>
        </FictionBook>
        """;

    private const string Fb2NoNamespace = """
        <?xml version="1.0" encoding="utf-8"?>
        <FictionBook>
          <description>
            <title-info>
              <book-title>No Namespace Book</book-title>
            </title-info>
          </description>
          <body>
            <section>
              <p>Content without namespace.</p>
            </section>
          </body>
        </FictionBook>
        """;

    [Fact]
    public async Task ExtractAsync_ValidFb2_ReturnsUnits()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(2, result.Units.Count);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ExtractsTitle()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("Test Book", result.Metadata.Title);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ExtractsAuthor()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("John Doe", result.Metadata.Authors);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ExtractsLanguage()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("en", result.Metadata.Language);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ExtractsDescription()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Contains("test book for extraction", result.Metadata.Description);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ReturnsNativeTextSource()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ReturnsFb2Format()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Fb2, result.SourceFormat);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ChaptersHaveTitles()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("Chapter One", result.Units[0].Title);
        Assert.Equal("Chapter Two", result.Units[1].Title);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_PlainTextExtracted()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Contains("first paragraph", result.Units[0].PlainText);
        Assert.Contains("second paragraph", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_HtmlGenerated()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Contains("<p>", result.Units[0].Html);
        Assert.Contains("<h2>", result.Units[0].Html);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_WordCountCalculated()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, unit => Assert.True(unit.WordCount > 0));
    }

    [Fact]
    public async Task ExtractAsync_Fb2WithPoem_ExtractsVerses()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(Fb2WithPoem));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "poem.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Contains("Roses are red", result.Units[0].PlainText);
        Assert.Contains("Violets are blue", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_Fb2NoNamespace_StillExtracts()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(Fb2NoNamespace));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "nonamespace.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal("No Namespace Book", result.Metadata.Title);
        Assert.Single(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_InvalidXml_NeverThrows()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not valid xml at all"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "invalid.fb2"
        };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_InvalidXml_ReturnsEmptyUnits()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Empty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_InvalidXml_ReturnsTextSourceNone()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_InvalidXml_HasParseErrorWarning()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("garbage"));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "garbage.fb2"
        };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Diagnostics.Warnings);
        Assert.Equal(ExtractionWarningCode.ParseError, result.Diagnostics.Warnings[0].Code);
    }

    [Fact]
    public async Task ExtractAsync_ThroughRegistry_ResolvesCorrectly()
    {
        var registry = new ExtractorRegistry([new Fb2TextExtractor()]);
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(MinimalFb2));

        var request = new ExtractionRequest
        {
            Content = stream,
            FileName = "test.fb2"
        };

        var extractor = registry.Resolve(request);
        var result = await extractor.ExtractAsync(request);

        Assert.Equal(SourceFormat.Fb2, result.SourceFormat);
        Assert.NotEmpty(result.Units);
    }

    [Fact]
    public void SupportedFormat_ReturnsFb2()
    {
        var extractor = new Fb2TextExtractor();
        Assert.Equal(SourceFormat.Fb2, extractor.SupportedFormat);
    }
}
