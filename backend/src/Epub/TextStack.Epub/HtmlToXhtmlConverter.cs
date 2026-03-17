using System.Text;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace TextStack.Epub;

public static class HtmlToXhtmlConverter
{
    private static readonly HashSet<string> VoidElements =
        ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

    public static string Convert(string html, string title)
    {
        var doc = new HtmlDocument();
        doc.OptionOutputAsXml = true;
        doc.OptionWriteEmptyNodes = true;
        doc.OptionOutputUpperCase = false;
        doc.LoadHtml(html);

        // Fix void elements: ensure self-closing
        FixVoidElements(doc.DocumentNode);

        var sb = new StringBuilder();
        sb.AppendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">");
        sb.AppendLine("<head>");
        sb.Append("  <title>").Append(EscapeXml(title)).AppendLine("</title>");
        sb.AppendLine("  <link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");

        // Get HTML output and strip any xml declaration HAP adds
        var bodyHtml = doc.DocumentNode.OuterHtml;
        if (bodyHtml.StartsWith("<?xml"))
        {
            var endOfDecl = bodyHtml.IndexOf("?>");
            if (endOfDecl >= 0)
                bodyHtml = bodyHtml[(endOfDecl + 2)..].TrimStart();
        }
        sb.Append(bodyHtml);

        sb.AppendLine();
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");

        return sb.ToString();
    }

    private static void FixVoidElements(HtmlNode node)
    {
        if (node.NodeType == HtmlNodeType.Element)
        {
            if (VoidElements.Contains(node.Name.ToLowerInvariant()) && !node.HasChildNodes)
            {
                // HAP with OptionOutputAsXml handles this, but ensure correct behavior
                node.InnerHtml = "";
            }
        }

        foreach (var child in node.ChildNodes.ToList())
            FixVoidElements(child);
    }

    private static string EscapeXml(string text) =>
        text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
}
