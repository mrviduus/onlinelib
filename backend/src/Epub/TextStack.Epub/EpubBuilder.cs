using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using TextStack.Epub.Models;

namespace TextStack.Epub;

public static class EpubBuilder
{
    private const string ContainerXml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>
        """;

    private const string StyleCss = """
        body { margin: 1em; font-family: serif; line-height: 1.6; }
        h1, h2, h3 { margin-top: 1.5em; }
        img { max-width: 100%; height: auto; }
        p { margin: 0.5em 0; text-indent: 1.5em; }
        .cover-page { text-align: center; padding: 0; margin: 0; }
        .cover-page img { max-height: 100%; }
        """;

    public static MemoryStream Build(EpubBookData book)
    {
        var ms = new MemoryStream();

        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            // mimetype MUST be first entry, stored (not deflated)
            AddEntry(zip, "mimetype", "application/epub+zip", CompressionLevel.NoCompression);

            // META-INF
            AddEntry(zip, "META-INF/container.xml", ContainerXml);

            // Style
            AddEntry(zip, "OEBPS/style.css", StyleCss);

            // Images (cover + inline)
            var imageManifestItems = new List<(string id, string href, string mediaType)>();

            if (book.Cover is not null)
            {
                var coverHref = $"images/{book.Cover.FileName}";
                AddBinaryEntry(zip, $"OEBPS/{coverHref}", book.Cover.Data);
                imageManifestItems.Add(("cover-image", coverHref, book.Cover.ContentType));
            }

            foreach (var img in book.Images)
            {
                var imgHref = $"images/{img.FileName}";
                AddBinaryEntry(zip, $"OEBPS/{imgHref}", img.Data);
                imageManifestItems.Add(($"img-{img.Id}", imgHref, img.ContentType));
            }

            // Cover page
            if (book.Cover is not null)
            {
                var coverXhtml = BuildCoverPage(book.Cover.FileName);
                AddEntry(zip, "OEBPS/cover.xhtml", coverXhtml);
            }

            // Chapters
            var chapterFiles = new List<(string id, string href, string title)>();
            foreach (var ch in book.Chapters.OrderBy(c => c.Order))
            {
                var fileName = $"chapter-{ch.Order:D3}.xhtml";
                var xhtml = HtmlToXhtmlConverter.Convert(ch.Html, ch.Title);

                // Rewrite image src paths
                foreach (var img in book.Images)
                    xhtml = xhtml.Replace($"/books/{img.Id}", $"images/{img.FileName}");

                AddEntry(zip, $"OEBPS/{fileName}", xhtml);
                chapterFiles.Add(($"ch-{ch.Order:D3}", fileName, ch.Title));
            }

            // content.opf
            var opf = BuildContentOpf(book, imageManifestItems, chapterFiles);
            AddEntry(zip, "OEBPS/content.opf", opf);

            // toc.xhtml
            var toc = BuildTocXhtml(book.Title, chapterFiles);
            AddEntry(zip, "OEBPS/toc.xhtml", toc);
        }

        ms.Position = 0;
        return ms;
    }

    private static string BuildCoverPage(string coverFileName) => $"""
        <?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE html>
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <title>Cover</title>
          <link rel="stylesheet" type="text/css" href="style.css"/>
        </head>
        <body class="cover-page">
          <img src="images/{coverFileName}" alt="Cover"/>
        </body>
        </html>
        """;

    private static string BuildContentOpf(
        EpubBookData book,
        List<(string id, string href, string mediaType)> images,
        List<(string id, string href, string title)> chapters)
    {
        var sb = new StringBuilder();
        sb.AppendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
        sb.AppendLine("<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"BookId\">");
        sb.AppendLine("  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">");
        sb.Append("    <dc:identifier id=\"BookId\">urn:uuid:").Append(Guid.NewGuid()).AppendLine("</dc:identifier>");
        sb.Append("    <dc:title>").Append(EscapeXml(book.Title)).AppendLine("</dc:title>");
        sb.Append("    <dc:language>").Append(EscapeXml(book.Language)).AppendLine("</dc:language>");
        if (!string.IsNullOrEmpty(book.Author))
            sb.Append("    <dc:creator>").Append(EscapeXml(book.Author)).AppendLine("</dc:creator>");
        if (!string.IsNullOrEmpty(book.Description))
            sb.Append("    <dc:description>").Append(EscapeXml(book.Description)).AppendLine("</dc:description>");
        sb.AppendLine("    <dc:publisher>TextStack</dc:publisher>");
        sb.Append("    <meta property=\"dcterms:modified\">").Append(DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")).AppendLine("</meta>");
        if (book.Cover is not null)
            sb.AppendLine("    <meta name=\"cover\" content=\"cover-image\"/>");
        sb.AppendLine("  </metadata>");

        sb.AppendLine("  <manifest>");
        sb.AppendLine("    <item id=\"nav\" href=\"toc.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>");
        sb.AppendLine("    <item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>");
        if (book.Cover is not null)
            sb.AppendLine("    <item id=\"cover\" href=\"cover.xhtml\" media-type=\"application/xhtml+xml\"/>");
        foreach (var ch in chapters)
            sb.Append("    <item id=\"").Append(ch.id).Append("\" href=\"").Append(ch.href).AppendLine("\" media-type=\"application/xhtml+xml\"/>");
        foreach (var img in images)
        {
            sb.Append("    <item id=\"").Append(img.id).Append("\" href=\"").Append(img.href)
                .Append("\" media-type=\"").Append(img.mediaType).Append("\"");
            if (img.id == "cover-image")
                sb.Append(" properties=\"cover-image\"");
            sb.AppendLine("/>");
        }
        sb.AppendLine("  </manifest>");

        sb.AppendLine("  <spine>");
        if (book.Cover is not null)
            sb.AppendLine("    <itemref idref=\"cover\"/>");
        foreach (var ch in chapters)
            sb.Append("    <itemref idref=\"").Append(ch.id).AppendLine("\"/>");
        sb.AppendLine("  </spine>");

        sb.AppendLine("</package>");
        return sb.ToString();
    }

    private static string BuildTocXhtml(string bookTitle, List<(string id, string href, string title)> chapters)
    {
        var sb = new StringBuilder();
        sb.AppendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">");
        sb.AppendLine("<head>");
        sb.Append("  <title>").Append(EscapeXml(bookTitle)).AppendLine(" - Table of Contents</title>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine("  <nav epub:type=\"toc\" id=\"toc\">");
        sb.AppendLine("    <h1>Table of Contents</h1>");
        sb.AppendLine("    <ol>");
        foreach (var ch in chapters)
            sb.Append("      <li><a href=\"").Append(ch.href).Append("\">").Append(EscapeXml(ch.title)).AppendLine("</a></li>");
        sb.AppendLine("    </ol>");
        sb.AppendLine("  </nav>");
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");
        return sb.ToString();
    }

    private static void AddEntry(ZipArchive zip, string path, string content,
        CompressionLevel level = CompressionLevel.Optimal)
    {
        var entry = zip.CreateEntry(path, level);
        using var stream = entry.Open();
        stream.Write(Encoding.UTF8.GetBytes(content));
    }

    private static void AddBinaryEntry(ZipArchive zip, string path, byte[] data)
    {
        var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
        using var stream = entry.Open();
        stream.Write(data);
    }

    private static string EscapeXml(string text) =>
        text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
}
