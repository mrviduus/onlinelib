using System.Text;
using TextStack.Extraction.Contracts;
using TextStack.Extraction.Enums;
using TextStack.Extraction.Extractors;

namespace TextStack.Extraction.Tests;

public class Fb2ExtractorTests
{
    private static string FixturePath => Path.Combine(
        AppContext.BaseDirectory, "Fixtures", "minimal.fb2");

    [Fact]
    public async Task ExtractAsync_ValidFb2_ReturnsUnitsWithMetadata()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.NotEmpty(result.Units);
        Assert.Equal("Minimal Test Book", result.Metadata.Title);
        Assert.Equal("Test Author", result.Metadata.Authors);
        Assert.Equal("en", result.Metadata.Language);
        Assert.Equal(SourceFormat.Fb2, result.SourceFormat);
        Assert.Equal(TextSource.NativeText, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ExtractsChapterTitles()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(2, result.Units.Count);
        Assert.Equal("Chapter 1", result.Units[0].Title);
        Assert.Equal("Chapter 2", result.Units[1].Title);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_ExtractsCoverImage()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.NotNull(result.Metadata.CoverImage);
        Assert.True(result.Metadata.CoverImage.Length > 0);
        Assert.Equal("image/jpeg", result.Metadata.CoverMimeType);
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_WordCountsPositive()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, u => Assert.True(u.WordCount > 0));
    }

    [Fact]
    public async Task ExtractAsync_ValidFb2_GeneratesToc()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.NotNull(result.Toc);
    }

    [Fact]
    public async Task ExtractAsync_InvalidXml_NeverThrows()
    {
        var extractor = new Fb2TextExtractor();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("not valid xml at all"));
        var request = new ExtractionRequest { Content = stream, FileName = "invalid.fb2" };

        var exception = await Record.ExceptionAsync(() => extractor.ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_EmptySections_Skipped()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Empty</book-title></title-info></description>
              <body>
                <section><title><p>Empty Chapter</p></title></section>
                <section><title><p>Real Chapter</p></title><p>Some actual content here for testing.</p></section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "empty-sections.fb2" };
        var extractor = new Fb2TextExtractor();

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Equal("Real Chapter", result.Units[0].Title);
    }

    [Fact]
    public async Task ExtractAsync_NestedSections_Flattened()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Nested</book-title></title-info></description>
              <body>
                <section>
                  <title><p>Part 1</p></title>
                  <section>
                    <title><p>Chapter 1</p></title>
                    <p>Content of chapter one with enough words.</p>
                  </section>
                  <section>
                    <title><p>Chapter 2</p></title>
                    <p>Content of chapter two with enough words.</p>
                  </section>
                </section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "nested.fb2" };
        var extractor = new Fb2TextExtractor();

        var result = await extractor.ExtractAsync(request);

        Assert.Equal(2, result.Units.Count);
        Assert.Equal("Chapter 1", result.Units[0].Title);
        Assert.Equal("Chapter 2", result.Units[1].Title);
    }

    [Fact]
    public async Task ExtractAsync_NoCover_NoCrash()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>No Cover</book-title></title-info></description>
              <body>
                <section><title><p>Chapter 1</p></title><p>Some content for the chapter.</p></section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "no-cover.fb2" };
        var extractor = new Fb2TextExtractor();

        var result = await extractor.ExtractAsync(request);

        Assert.Null(result.Metadata.CoverImage);
        Assert.NotEmpty(result.Units);
    }

    [Fact]
    public async Task ExtractAsync_MultipleAuthors_JoinedWithComma()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description>
                <title-info>
                  <author><first-name>John</first-name><last-name>Doe</last-name></author>
                  <author><first-name>Jane</first-name><middle-name>M</middle-name><last-name>Smith</last-name></author>
                  <book-title>Co-authored Book</book-title>
                </title-info>
              </description>
              <body>
                <section><title><p>Ch1</p></title><p>Some text content here.</p></section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "multi-author.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Equal("John Doe, Jane M Smith", result.Metadata.Authors);
    }

    [Fact]
    public async Task ExtractAsync_FormattingTags_ConvertedToHtml()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Fmt</book-title></title-info></description>
              <body>
                <section>
                  <title><p>Formatted</p></title>
                  <p>Normal <emphasis>italic</emphasis> and <strong>bold</strong> and <strikethrough>deleted</strikethrough> text.</p>
                </section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "fmt.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Contains("italic", result.Units[0].PlainText);
        Assert.Contains("bold", result.Units[0].PlainText);
        Assert.Contains("deleted", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_PoemAndEpigraph_ConvertedToHtml()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Poetry</book-title></title-info></description>
              <body>
                <section>
                  <title><p>Poem Chapter</p></title>
                  <epigraph><p>Some wise quote here.</p><text-author>Wise Person</text-author></epigraph>
                  <poem>
                    <stanza>
                      <v>Roses are red,</v>
                      <v>Violets are blue.</v>
                    </stanza>
                  </poem>
                  <p>After the poem there is more content.</p>
                </section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "poem.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Contains("Roses are red", result.Units[0].PlainText);
        Assert.Contains("Wise Person", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_NotesBody_Skipped()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Notes</book-title></title-info></description>
              <body>
                <section><title><p>Chapter 1</p></title><p>Main content text here.</p></section>
              </body>
              <body name="notes">
                <section id="n1"><title><p>1</p></title><p>This is a footnote that should not appear.</p></section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "notes.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Equal("Chapter 1", result.Units[0].Title);
        Assert.DoesNotContain("footnote", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_NoBody_ReturnsEmptyUnits()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>No Body</book-title></title-info></description>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "nobody.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Empty(result.Units);
        Assert.Equal("No Body", result.Metadata.Title);
        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
    }

    [Fact]
    public async Task ExtractAsync_AnnotationDescription_Extracted()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description>
                <title-info>
                  <book-title>Desc Book</book-title>
                  <annotation><p>This is a book about adventures.</p><p>It is very exciting.</p></annotation>
                </title-info>
              </description>
              <body>
                <section><title><p>Ch</p></title><p>Content here for the chapter.</p></section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "desc.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.NotNull(result.Metadata.Description);
        Assert.Contains("adventures", result.Metadata.Description);
        Assert.Contains("exciting", result.Metadata.Description);
    }

    [Fact]
    public async Task ExtractAsync_InvalidXml_ReturnsDiagnosticsParseError()
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("<broken xml"));
        var request = new ExtractionRequest { Content = stream, FileName = "broken.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Equal(SourceFormat.Fb2, result.SourceFormat);
        Assert.Equal(TextSource.None, result.Diagnostics.TextSource);
        Assert.Contains(result.Diagnostics.Warnings,
            w => w.Code == ExtractionWarningCode.ParseError);
    }

    [Fact]
    public async Task ExtractAsync_UntitledSection_GetsFallbackTitle()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Untitled</book-title></title-info></description>
              <body>
                <section>
                  <p>Content without any title element for this section.</p>
                </section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "untitled.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.Equal("Section 1", result.Units[0].Title);
    }

    [Fact]
    public async Task ExtractAsync_InlineImages_ConvertedToImgTags()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
              <description><title-info><book-title>Images</book-title></title-info></description>
              <body>
                <section>
                  <title><p>With Image</p></title>
                  <p>Before image text.</p>
                  <image l:href="#pic1.png"/>
                  <p>After image text.</p>
                </section>
              </body>
              <binary id="pic1.png" content-type="image/png">iVBORw0KGgo=</binary>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "images.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Single(result.Units);
        Assert.NotEmpty(result.Images);
        Assert.Contains("Before image", result.Units[0].PlainText);
    }

    [Fact]
    public async Task ExtractAsync_NestedWithOwnContent_SplitCorrectly()
    {
        var xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
              <description><title-info><book-title>Mixed</book-title></title-info></description>
              <body>
                <section>
                  <title><p>Part 1</p></title>
                  <p>Introduction to part one with some text.</p>
                  <section>
                    <title><p>Chapter 1</p></title>
                    <p>Chapter one content text here.</p>
                  </section>
                </section>
              </body>
            </FictionBook>
            """;
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        var request = new ExtractionRequest { Content = stream, FileName = "mixed.fb2" };

        var result = await new Fb2TextExtractor().ExtractAsync(request);

        Assert.Equal(2, result.Units.Count);
        Assert.Equal("Part 1", result.Units[0].Title);
        Assert.Contains("Introduction", result.Units[0].PlainText);
        Assert.Equal("Chapter 1", result.Units[1].Title);
    }

    [Fact]
    public async Task ExtractAsync_CoverMarkedInImagesList()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.Single(result.Images);
        Assert.True(result.Images[0].IsCover);
        Assert.Equal("cover.jpg", result.Images[0].OriginalPath);
    }

    [Fact]
    public async Task ExtractAsync_EmptyStream_NeverThrows()
    {
        using var stream = new MemoryStream([]);
        var request = new ExtractionRequest { Content = stream, FileName = "empty.fb2" };

        var exception = await Record.ExceptionAsync(
            () => new Fb2TextExtractor().ExtractAsync(request));

        Assert.Null(exception);
    }

    [Fact]
    public async Task ExtractAsync_OrderIndexSequential()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        for (var i = 0; i < result.Units.Count; i++)
            Assert.Equal(i, result.Units[i].OrderIndex);
    }

    [Fact]
    public async Task ExtractAsync_AllUnitsAreChapterType()
    {
        var extractor = new Fb2TextExtractor();
        await using var stream = File.OpenRead(FixturePath);
        var request = new ExtractionRequest { Content = stream, FileName = "minimal.fb2" };

        var result = await extractor.ExtractAsync(request);

        Assert.All(result.Units, u => Assert.Equal(ContentUnitType.Chapter, u.Type));
    }
}
