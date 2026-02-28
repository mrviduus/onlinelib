using System.Net;
using System.Text;
using System.Xml.Linq;
using TextStack.Extraction.Contracts;
using TextStack.Extraction.Enums;
using TextStack.Extraction.TextProcessing.Processors;
using TextStack.Extraction.Toc;
using TextStack.Extraction.Utilities;

namespace TextStack.Extraction.Extractors;

public sealed class Fb2TextExtractor : ITextExtractor
{
    public SourceFormat SupportedFormat => SourceFormat.Fb2;

    private static readonly XNamespace Fb2Ns = "http://www.gribuser.ru/xml/fictionbook/2.0";
    private static readonly XNamespace XlinkNs = "http://www.w3.org/1999/xlink";

    public async Task<ExtractionResult> ExtractAsync(ExtractionRequest request, CancellationToken ct = default)
    {
        var warnings = new List<ExtractionWarning>();

        XDocument doc;
        try
        {
            doc = await XDocument.LoadAsync(request.Content, LoadOptions.None, ct);
        }
        catch (Exception ex)
        {
            warnings.Add(new ExtractionWarning(
                ExtractionWarningCode.ParseError,
                $"Failed to parse FB2: {ex.Message}"));

            return new ExtractionResult(
                SourceFormat.Fb2,
                new ExtractionMetadata(null, null, null, null),
                [], [], new ExtractionDiagnostics(TextSource.None, null, warnings));
        }

        var root = doc.Root;
        if (root == null)
        {
            warnings.Add(new ExtractionWarning(ExtractionWarningCode.EmptyContent, "Empty FB2 document"));
            return new ExtractionResult(
                SourceFormat.Fb2,
                new ExtractionMetadata(null, null, null, null),
                [], [], new ExtractionDiagnostics(TextSource.None, null, warnings));
        }

        // Detect namespace — some FB2 files omit xmlns
        var ns = root.Name.Namespace != XNamespace.None ? root.Name.Namespace : Fb2Ns;

        // --- Metadata ---
        var titleInfo = root.Element(ns + "description")?.Element(ns + "title-info");

        var title = titleInfo?.Element(ns + "book-title")?.Value?.Trim();

        var authors = titleInfo?.Elements(ns + "author")
            .Select(a => string.Join(" ",
                new[] { a.Element(ns + "first-name")?.Value, a.Element(ns + "middle-name")?.Value, a.Element(ns + "last-name")?.Value }
                    .Where(s => !string.IsNullOrWhiteSpace(s))))
            .Where(s => !string.IsNullOrEmpty(s))
            .ToList();
        var authorsStr = authors?.Count > 0 ? string.Join(", ", authors) : null;

        var lang = titleInfo?.Element(ns + "lang")?.Value?.Trim();

        var annotation = titleInfo?.Element(ns + "annotation");
        var description = annotation != null ? GetPlainText(annotation) : null;

        // --- Binary images ---
        var binaryMap = new Dictionary<string, (byte[] Data, string MimeType)>(StringComparer.OrdinalIgnoreCase);
        var images = new List<ExtractedImage>();

        foreach (var binary in root.Elements(ns + "binary"))
        {
            try
            {
                var id = binary.Attribute("id")?.Value;
                if (string.IsNullOrEmpty(id)) continue;

                var base64 = binary.Value.Trim();
                if (string.IsNullOrEmpty(base64)) continue;

                var data = Convert.FromBase64String(base64);
                if (data.Length == 0) continue;

                var mimeType = ImageUtils.DetectMimeType(data);
                binaryMap[id] = (data, mimeType);
                images.Add(new ExtractedImage(id, data, mimeType, IsCover: false));
            }
            catch (Exception ex)
            {
                warnings.Add(new ExtractionWarning(
                    ExtractionWarningCode.ChapterParseError,
                    $"Failed to decode binary '{binary.Attribute("id")?.Value}': {ex.Message}"));
            }
        }

        // --- Cover ---
        byte[]? coverImage = null;
        string? coverMimeType = null;

        try
        {
            var coverpage = titleInfo?.Element(ns + "coverpage");
            var coverImageEl = coverpage?.Element(ns + "image");
            if (coverImageEl != null)
            {
                var href = coverImageEl.Attribute(XlinkNs + "href")?.Value
                        ?? coverImageEl.Attribute("href")?.Value;
                if (href != null)
                {
                    var coverId = href.TrimStart('#');
                    if (binaryMap.TryGetValue(coverId, out var coverData))
                    {
                        coverImage = coverData.Data;
                        coverMimeType = coverData.MimeType;
                        var idx = images.FindIndex(i => i.OriginalPath == coverId);
                        if (idx >= 0) images[idx] = images[idx] with { IsCover = true };
                    }
                }
            }
        }
        catch (Exception ex)
        {
            warnings.Add(new ExtractionWarning(
                ExtractionWarningCode.CoverExtractionFailed,
                $"Failed to extract cover: {ex.Message}"));
        }

        // --- Chapters ---
        var mainBody = root.Elements(ns + "body")
            .FirstOrDefault(b => b.Attribute("name") == null);

        var units = new List<ContentUnit>();
        var tocChapters = new List<(int ChapterNumber, string Html)>();

        if (mainBody != null)
        {
            var flatSections = FlattenSections(mainBody, ns);
            var order = 0;

            foreach (var (sectionTitle, rawHtml) in flatSections)
            {
                if (ct.IsCancellationRequested) break;

                try
                {
                    var (cleanHtml, plainText) = HtmlCleaner.Clean(rawHtml);
                    if (string.IsNullOrWhiteSpace(plainText)) continue;

                    try
                    {
                        if (PiracyWatermarkProcessor.IsPiracyWatermark(cleanHtml))
                        {
                            warnings.Add(new ExtractionWarning(
                                ExtractionWarningCode.ContentFiltered,
                                "Skipped piracy watermark chapter"));
                            continue;
                        }
                    }
                    catch { }

                    var chapterNumber = order + 1;
                    var chapterTitle = sectionTitle ?? $"Section {chapterNumber}";
                    var wordCount = HtmlCleaner.CountWords(plainText);

                    cleanHtml = TocGenerator.InjectAnchorIds(cleanHtml, chapterNumber);
                    tocChapters.Add((chapterNumber, cleanHtml));

                    units.Add(new ContentUnit(
                        Type: ContentUnitType.Chapter,
                        Title: chapterTitle,
                        Html: cleanHtml,
                        PlainText: plainText,
                        OrderIndex: order++,
                        WordCount: wordCount));
                }
                catch (Exception ex)
                {
                    warnings.Add(new ExtractionWarning(
                        ExtractionWarningCode.ChapterParseError,
                        $"Failed to parse section: {ex.Message}"));
                }
            }
        }

        if (units.Count == 0 && mainBody != null)
        {
            warnings.Add(new ExtractionWarning(ExtractionWarningCode.EmptyContent, "No content extracted from FB2"));
        }

        var toc = TocGenerator.GenerateToc(tocChapters);
        var metadata = new ExtractionMetadata(title, authorsStr, lang, description, coverImage, coverMimeType);
        var textSource = units.Count > 0 ? TextSource.NativeText : TextSource.None;
        var diagnostics = new ExtractionDiagnostics(textSource, null, warnings);

        return new ExtractionResult(SourceFormat.Fb2, metadata, units, images, diagnostics, toc);
    }

    /// <summary>
    /// Recursively flattens nested &lt;section&gt; elements into a flat list of (title, html) pairs.
    /// </summary>
    private static List<(string? Title, string Html)> FlattenSections(XElement parent, XNamespace ns, string? parentTitle = null)
    {
        var result = new List<(string?, string)>();
        var sections = parent.Elements(ns + "section").ToList();

        if (sections.Count == 0)
        {
            // Leaf — convert content directly
            var sectionTitle = ExtractSectionTitle(parent, ns) ?? parentTitle;
            var html = ConvertSectionToHtml(parent, ns);
            if (!string.IsNullOrWhiteSpace(html))
                result.Add((sectionTitle, html));
            return result;
        }

        // Has child sections — check for own content before first section
        var ownContent = GetOwnContentElements(parent, ns);
        if (ownContent.Count > 0)
        {
            var sectionTitle = ExtractSectionTitle(parent, ns) ?? parentTitle;
            var html = ConvertElementsToHtml(ownContent, ns);
            if (!string.IsNullOrWhiteSpace(html))
                result.Add((sectionTitle, html));
        }

        var currentTitle = ExtractSectionTitle(parent, ns);
        foreach (var section in sections)
        {
            var childTitle = ExtractSectionTitle(section, ns);
            var effectiveParent = childTitle == null ? (currentTitle ?? parentTitle) : null;
            result.AddRange(FlattenSections(section, ns, effectiveParent));
        }

        return result;
    }

    /// <summary>
    /// Converts a section's content elements (excluding nested sections and title) to HTML.
    /// </summary>
    private static string ConvertSectionToHtml(XElement section, XNamespace ns)
    {
        var elements = section.Elements()
            .Where(e => e.Name.LocalName != "section" && e.Name.LocalName != "title")
            .ToList();
        return ConvertElementsToHtml(elements, ns);
    }

    private static string ConvertElementsToHtml(IEnumerable<XElement> elements, XNamespace ns)
    {
        var sb = new StringBuilder();
        foreach (var el in elements)
            sb.Append(ConvertElement(el, ns));
        return sb.ToString();
    }

    /// <summary>
    /// Recursively converts an FB2 XML element to HTML.
    /// </summary>
    private static string ConvertElement(XElement element, XNamespace ns)
    {
        var sb = new StringBuilder();
        var localName = element.Name.LocalName;

        var (openTag, closeTag) = localName switch
        {
            "p" => ("<p>", "</p>"),
            "emphasis" => ("<em>", "</em>"),
            "strong" => ("<strong>", "</strong>"),
            "strikethrough" => ("<del>", "</del>"),
            "code" => ("<code>", "</code>"),
            "sup" => ("<sup>", "</sup>"),
            "sub" => ("<sub>", "</sub>"),
            "subtitle" => ("<h3>", "</h3>"),
            "epigraph" => ("<blockquote class=\"epigraph\">", "</blockquote>"),
            "cite" => ("<blockquote>", "</blockquote>"),
            "poem" => ("<div class=\"poem\">", "</div>"),
            "stanza" => ("<div class=\"stanza\">", "</div>"),
            "v" => ("<p class=\"verse\">", "</p>"),
            "text-author" => ("<p class=\"text-author\">", "</p>"),
            "title" => ("<h2>", "</h2>"),
            "table" => ("<table>", "</table>"),
            "tr" => ("<tr>", "</tr>"),
            "td" => ("<td>", "</td>"),
            "th" => ("<th>", "</th>"),
            _ => ("", "")
        };

        if (localName == "empty-line")
        {
            sb.Append("<br/>");
        }
        else if (localName == "image")
        {
            var href = element.Attribute(XlinkNs + "href")?.Value
                    ?? element.Attribute("href")?.Value;
            if (href != null)
            {
                var imgId = href.TrimStart('#');
                sb.Append($"<img src=\"{WebUtility.HtmlEncode(imgId)}\"/>");
            }
        }
        else if (localName == "a")
        {
            var href = element.Attribute(XlinkNs + "href")?.Value
                    ?? element.Attribute("href")?.Value ?? "#";
            // Internal note links → dead link, external links kept
            if (href.StartsWith('#')) href = "#";
            sb.Append($"<a href=\"{WebUtility.HtmlEncode(href)}\">");
            AppendChildNodes(sb, element, ns);
            sb.Append("</a>");
        }
        else if (localName == "section")
        {
            // Skip nested sections — handled by FlattenSections
        }
        else if (!string.IsNullOrEmpty(openTag))
        {
            sb.Append(openTag);
            AppendChildNodes(sb, element, ns);
            sb.Append(closeTag);
        }
        else
        {
            // Unknown tag — just render children
            AppendChildNodes(sb, element, ns);
        }

        return sb.ToString();
    }

    private static void AppendChildNodes(StringBuilder sb, XElement element, XNamespace ns)
    {
        foreach (var node in element.Nodes())
        {
            if (node is XText text)
                sb.Append(WebUtility.HtmlEncode(text.Value));
            else if (node is XElement child)
                sb.Append(ConvertElement(child, ns));
        }
    }

    private static string? ExtractSectionTitle(XElement section, XNamespace ns)
    {
        var titleEl = section.Element(ns + "title");
        if (titleEl == null) return null;

        var text = string.Join(" ", titleEl.Elements(ns + "p").Select(p => p.Value.Trim()))
            .Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static string GetPlainText(XElement element)
    {
        return string.Join(" ", element.DescendantNodes().OfType<XText>().Select(t => t.Value.Trim())
            .Where(t => !string.IsNullOrEmpty(t))).Trim();
    }

    private static List<XElement> GetOwnContentElements(XElement element, XNamespace ns)
    {
        return element.Elements()
            .Where(e => e.Name.LocalName != "section" && e.Name.LocalName != "title")
            .ToList();
    }
}
