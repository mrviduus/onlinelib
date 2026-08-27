using System.IO.Compression;
using System.Text;
using TextStack.Extraction.Contracts;
using TextStack.Extraction.Extractors;

namespace TextStack.Extraction.Tests;

/// <summary>
/// Publishers routinely list the EPUB 3 navigation document in the spine. Nothing
/// skipped it, so it arrived as unit zero, <c>DetectFrontMatterType</c> titled it
/// "Contents", and a reader opening their own uploaded book landed on a page of
/// default-blue underlined links over the serif layout — with the title repeated
/// three times and the numbering broken.
///
/// The fixture is built here rather than checked in because the defect is about a
/// specific structural choice (nav present AND in the spine) that the existing
/// fixtures do not make, and a binary fixture would hide that choice from anyone
/// reading the test.
/// </summary>
public class EpubNavigationDocumentTests
{
    [Fact]
    public async Task ExtractAsync_NavDocumentInSpine_IsNotAChapter()
    {
        await using var epub = BuildEpubWithNavInSpine();
        var result = await new EpubTextExtractor().ExtractAsync(
            new ExtractionRequest { Content = epub, FileName = "nav-in-spine.epub" });

        Assert.Single(result.Units);
        Assert.Equal("Chapter One", result.Units[0].Title);
        // The nav document's own text must not appear anywhere in the book.
        Assert.DoesNotContain(result.Units, u => (u.PlainText ?? string.Empty).Contains("Table of Contents"));
    }

    [Fact]
    public async Task ExtractAsync_NavDocumentInSpine_RecordsWhyItWasDropped()
    {
        // Silent filtering is how a parser loses a real chapter and nobody notices.
        await using var epub = BuildEpubWithNavInSpine();
        var result = await new EpubTextExtractor().ExtractAsync(
            new ExtractionRequest { Content = epub, FileName = "nav-in-spine.epub" });

        Assert.Contains(result.Diagnostics.Warnings, w => w.Message.Contains("navigation document"));
    }

    [Fact]
    public async Task ExtractAsync_ChapterMentioningContents_IsKept()
    {
        // The guard is a file-path match, not a text match, precisely so that a
        // real chapter discussing a table of contents survives. The old fuzzy
        // detection is what made the nav document look like legitimate front
        // matter to begin with.
        await using var epub = BuildEpubWithNavInSpine(
            chapterBody: "<h1>Chapter One</h1><p>He studied the table of contents for a long while.</p>");
        var result = await new EpubTextExtractor().ExtractAsync(
            new ExtractionRequest { Content = epub, FileName = "nav-in-spine.epub" });

        Assert.Single(result.Units);
        Assert.Contains("table of contents", result.Units[0].PlainText ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }

    private static Stream BuildEpubWithNavInSpine(string? chapterBody = null)
    {
        const string container = """
            <?xml version="1.0" encoding="UTF-8"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
            </container>
            """;

        const string opf = """
            <?xml version="1.0" encoding="UTF-8"?>
            <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
              <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:identifier id="uid">urn:uuid:nav-in-spine</dc:identifier>
                <dc:title>Nav In Spine</dc:title>
                <dc:language>en</dc:language>
                <dc:creator>Test Author</dc:creator>
              </metadata>
              <manifest>
                <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
                <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
              </manifest>
              <spine>
                <itemref idref="nav"/>
                <itemref idref="ch1"/>
              </spine>
            </package>
            """;

        const string nav = """
            <?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
              <head><title>Nav In Spine</title></head>
              <body>
                <nav epub:type="toc" id="toc">
                  <h1>Table of Contents</h1>
                  <ol><li><a href="ch1.xhtml">Chapter One</a></li></ol>
                </nav>
              </body>
            </html>
            """;

        var body = chapterBody ?? "<h1>Chapter One</h1><p>" + string.Join(" ",
            Enumerable.Repeat("The first real words of the book.", 12)) + "</p>";
        var chapter = $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml">
              <head><title>Chapter One</title></head>
              <body>{body}</body>
            </html>
            """;

        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            // mimetype must be first and stored uncompressed.
            var mime = zip.CreateEntry("mimetype", CompressionLevel.NoCompression);
            using (var w = new StreamWriter(mime.Open(), Encoding.ASCII)) w.Write("application/epub+zip");

            Add(zip, "META-INF/container.xml", container);
            Add(zip, "OEBPS/content.opf", opf);
            Add(zip, "OEBPS/nav.xhtml", nav);
            Add(zip, "OEBPS/ch1.xhtml", chapter);
        }
        ms.Position = 0;
        return ms;

        static void Add(ZipArchive zip, string path, string content)
        {
            using var w = new StreamWriter(zip.CreateEntry(path).Open(), new UTF8Encoding(false));
            w.Write(content);
        }
    }
}
