using System.IO.Compression;
using System.Text;
using TextStack.Epub;
using TextStack.Epub.Models;

namespace TextStack.UnitTests;

public class EpubBuilderTests
{
    private static EpubBookData MinimalBook() => new()
    {
        Title = "Test Book",
        Language = "en",
        Author = "Test Author",
        Chapters =
        [
            new EpubChapterData { Order = 1, Title = "Chapter 1", Html = "<p>Hello world</p>" }
        ]
    };

    [Fact]
    public void Build_MinimalBook_ProducesValidZip()
    {
        var stream = EpubBuilder.Build(MinimalBook());
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        Assert.Contains(zip.Entries, e => e.FullName == "mimetype");
        Assert.Contains(zip.Entries, e => e.FullName == "META-INF/container.xml");
        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/content.opf");
        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/toc.xhtml");
        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/style.css");
    }

    [Fact]
    public void Build_MimetypeIsFirstEntry()
    {
        var stream = EpubBuilder.Build(MinimalBook());
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        var first = zip.Entries[0];
        Assert.Equal("mimetype", first.FullName);
        // Must be stored (not compressed) per EPUB spec
        Assert.Equal(first.Length, first.CompressedLength);
    }

    [Fact]
    public void Build_MimetypeContent_IsCorrect()
    {
        var stream = EpubBuilder.Build(MinimalBook());
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        var entry = zip.GetEntry("mimetype")!;
        using var reader = new StreamReader(entry.Open());
        Assert.Equal("application/epub+zip", reader.ReadToEnd());
    }

    [Fact]
    public void Build_WithChapters_CreatesXhtmlFiles()
    {
        var book = new EpubBookData
        {
            Title = "Multi Chapter",
            Language = "en",
            Chapters =
            [
                new EpubChapterData { Order = 1, Title = "Ch 1", Html = "<p>One</p>" },
                new EpubChapterData { Order = 2, Title = "Ch 2", Html = "<p>Two</p>" },
            ]
        };

        var stream = EpubBuilder.Build(book);
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/chapter-001.xhtml");
        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/chapter-002.xhtml");
    }

    [Fact]
    public void Build_WithCover_EmbedsCoverImage()
    {
        var coverData = Encoding.UTF8.GetBytes("fake-cover-data");
        var book = new EpubBookData
        {
            Title = "With Cover",
            Language = "en",
            Cover = new EpubImageData
            {
                Id = "cover",
                Data = coverData,
                ContentType = "image/jpeg",
                FileName = "cover.jpg"
            },
            Chapters = [new EpubChapterData { Order = 1, Title = "Ch 1", Html = "<p>Text</p>" }]
        };

        var stream = EpubBuilder.Build(book);
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/images/cover.jpg");
        Assert.Contains(zip.Entries, e => e.FullName == "OEBPS/cover.xhtml");
    }

    [Fact]
    public void Build_ContentOpf_ContainsMetadata()
    {
        var stream = EpubBuilder.Build(MinimalBook());
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        var opf = zip.GetEntry("OEBPS/content.opf")!;
        using var reader = new StreamReader(opf.Open());
        var content = reader.ReadToEnd();

        Assert.Contains("<dc:title>Test Book</dc:title>", content);
        Assert.Contains("<dc:creator>Test Author</dc:creator>", content);
        Assert.Contains("<dc:language>en</dc:language>", content);
    }

    [Fact]
    public void Build_TocXhtml_ContainsChapterLinks()
    {
        var stream = EpubBuilder.Build(MinimalBook());
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        var toc = zip.GetEntry("OEBPS/toc.xhtml")!;
        using var reader = new StreamReader(toc.Open());
        var content = reader.ReadToEnd();

        Assert.Contains("chapter-001.xhtml", content);
        Assert.Contains("Chapter 1", content);
    }

    [Fact]
    public void Build_ChapterXhtml_IsValidXhtml()
    {
        var stream = EpubBuilder.Build(MinimalBook());
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        var ch = zip.GetEntry("OEBPS/chapter-001.xhtml")!;
        using var reader = new StreamReader(ch.Open());
        var content = reader.ReadToEnd();

        Assert.Contains("<?xml version=", content);
        Assert.Contains("xmlns=\"http://www.w3.org/1999/xhtml\"", content);
        Assert.Contains("<body>", content);
        Assert.Contains("Hello world", content);
    }

    [Fact]
    public void Build_WithInlineImages_EmbedsAndRewrites()
    {
        var imgData = Encoding.UTF8.GetBytes("fake-image");
        var imgId = Guid.NewGuid().ToString();
        var book = new EpubBookData
        {
            Title = "With Images",
            Language = "en",
            Chapters =
            [
                new EpubChapterData
                {
                    Order = 1,
                    Title = "Ch 1",
                    Html = $"<p><img src=\"/books/{imgId}\" /></p>"
                }
            ],
            Images =
            [
                new EpubImageData
                {
                    Id = imgId,
                    Data = imgData,
                    ContentType = "image/png",
                    FileName = $"img-{imgId}.png"
                }
            ]
        };

        var stream = EpubBuilder.Build(book);
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        Assert.Contains(zip.Entries, e => e.FullName == $"OEBPS/images/img-{imgId}.png");
    }

    [Fact]
    public void HtmlToXhtml_WrapsInXhtmlBoilerplate()
    {
        var result = HtmlToXhtmlConverter.Convert("<p>Test</p>", "My Title");

        Assert.Contains("<?xml version=", result);
        Assert.Contains("xmlns=\"http://www.w3.org/1999/xhtml\"", result);
        Assert.Contains("<title>My Title</title>", result);
        Assert.Contains("style.css", result);
    }

    [Fact]
    public void HtmlToXhtml_EscapesSpecialCharsInTitle()
    {
        var result = HtmlToXhtmlConverter.Convert("<p>Test</p>", "A & B <C>");

        Assert.Contains("A &amp; B &lt;C&gt;", result);
    }
}
