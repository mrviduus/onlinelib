using System.Text;
using System.Text.RegularExpressions;
using HtmlAgilityPack;
using VersOne.Epub;

namespace Worker.Parsers;

public partial class EpubParser
{
    public async Task<ParsedBook> ParseAsync(string filePath, CancellationToken ct = default)
    {
        var book = await EpubReader.ReadBookAsync(filePath);

        var title = book.Title;
        var authors = book.AuthorList?.Count > 0 ? string.Join(", ", book.AuthorList) : null;
        var description = book.Description;

        var chapters = new List<ParsedChapter>();
        var order = 0;

        // Get reading order from spine
        foreach (var textContent in book.ReadingOrder)
        {
            ct.ThrowIfCancellationRequested();

            var html = textContent.Content;
            if (string.IsNullOrWhiteSpace(html))
                continue;

            var (cleanHtml, plainText) = CleanHtml(html);
            if (string.IsNullOrWhiteSpace(plainText))
                continue;

            var chapterTitle = ExtractTitle(html) ?? $"Chapter {order + 1}";
            var wordCount = CountWords(plainText);

            chapters.Add(new ParsedChapter(
                Order: order++,
                Title: chapterTitle,
                Html: cleanHtml,
                PlainText: plainText,
                WordCount: wordCount
            ));
        }

        return new ParsedBook(
            Title: title,
            Authors: authors,
            Description: description,
            CoverPath: null, // TODO: extract cover
            Chapters: chapters
        );
    }

    private static (string Html, string PlainText) CleanHtml(string html)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        // Remove scripts and styles
        doc.DocumentNode.SelectNodes("//script|//style|//head")?.ToList()
            .ForEach(n => n.Remove());

        // Get body content only
        var body = doc.DocumentNode.SelectSingleNode("//body");
        var content = body ?? doc.DocumentNode;

        // Remove dangerous attributes
        RemoveDangerousAttributes(content);

        var cleanHtml = content.InnerHtml.Trim();
        var plainText = ExtractPlainText(content);

        return (cleanHtml, plainText);
    }

    private static void RemoveDangerousAttributes(HtmlNode node)
    {
        var dangerous = new[] { "onclick", "onload", "onerror", "onmouseover", "onfocus", "onblur" };

        foreach (var descendant in node.DescendantsAndSelf())
        {
            foreach (var attr in dangerous)
            {
                descendant.Attributes.Remove(attr);
            }

            // Handle links
            var href = descendant.GetAttributeValue("href", "");
            if (!string.IsNullOrEmpty(href))
            {
                // Remove javascript: hrefs
                if (href.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase))
                {
                    descendant.SetAttributeValue("href", "#");
                }
                // Remove internal EPUB links (relative paths to .htm/.html/.xhtml files)
                else if (!href.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                         !href.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
                         !href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
                {
                    // Keep anchor-only links (#section), remove file references
                    if (href.StartsWith('#'))
                    {
                        // Keep as-is - internal page anchor
                    }
                    else if (href.Contains('#'))
                    {
                        // Has file + anchor, keep only anchor
                        descendant.SetAttributeValue("href", "#" + href.Split('#')[1]);
                    }
                    else
                    {
                        // Pure file reference - remove link but keep text
                        descendant.SetAttributeValue("href", "#");
                    }
                }
            }
        }
    }

    private static string ExtractPlainText(HtmlNode node)
    {
        var sb = new StringBuilder();
        ExtractTextRecursive(node, sb);
        var text = sb.ToString();

        // Normalize whitespace
        text = WhitespaceRegex().Replace(text, " ");
        return text.Trim();
    }

    private static void ExtractTextRecursive(HtmlNode node, StringBuilder sb)
    {
        if (node.NodeType == HtmlNodeType.Text)
        {
            var text = HtmlEntity.DeEntitize(node.InnerText);
            sb.Append(text);
            return;
        }

        // Add space before block elements
        var blockTags = new[] { "p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr" };
        if (blockTags.Contains(node.Name.ToLowerInvariant()))
            sb.Append(' ');

        foreach (var child in node.ChildNodes)
        {
            ExtractTextRecursive(child, sb);
        }

        if (blockTags.Contains(node.Name.ToLowerInvariant()))
            sb.Append(' ');
    }

    private static string? ExtractTitle(string html)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        // Try h1, h2, title
        var titleNode = doc.DocumentNode.SelectSingleNode("//h1")
            ?? doc.DocumentNode.SelectSingleNode("//h2")
            ?? doc.DocumentNode.SelectSingleNode("//title");

        var title = titleNode?.InnerText?.Trim();
        if (!string.IsNullOrWhiteSpace(title))
            return HtmlEntity.DeEntitize(title);

        return null;
    }

    private static int CountWords(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return 0;

        return text.Split([' ', '\t', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries).Length;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
