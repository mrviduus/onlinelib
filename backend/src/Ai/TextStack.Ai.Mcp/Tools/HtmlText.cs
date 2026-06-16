using System.Net;
using System.Text;

namespace TextStack.Ai.Mcp.Tools;

/// <summary>
/// Minimal, dependency-free HTML → plain-text reduction for the chapter body the
/// model reads. The chapter endpoint returns rendered <c>Html</c>; feeding raw
/// markup to the model wastes tokens and leaks layout noise. This strips tags,
/// decodes entities, collapses whitespace, and caps length.
///
/// Deliberately NOT a full HTML parser — the bridge stays free of HtmlAgilityPack
/// / AngleSharp. Good enough for clean reader HTML.
/// </summary>
internal static class HtmlText
{
    /// <summary>Default character cap for the model-facing chapter text.</summary>
    public const int DefaultMaxChars = 40_000;

    /// <summary>
    /// Strips tags + decodes entities + collapses whitespace, then truncates to
    /// <paramref name="maxChars"/>. <paramref name="truncated"/> reports whether
    /// the cap clipped the text so the handler can annotate the output.
    /// </summary>
    public static string StripAndCap(string? html, int maxChars, out bool truncated)
    {
        truncated = false;
        if (string.IsNullOrEmpty(html))
            return "";

        var sb = new StringBuilder(html.Length);
        var inTag = false;
        foreach (var c in html)
        {
            if (c == '<') { inTag = true; continue; }
            if (c == '>') { inTag = false; sb.Append(' '); continue; }
            if (!inTag) sb.Append(c);
        }

        // Decode entities (&amp; &#8217; …) then collapse runs of whitespace.
        var decoded = WebUtility.HtmlDecode(sb.ToString());
        var text = CollapseWhitespace(decoded);

        if (text.Length > maxChars)
        {
            text = text[..maxChars].TrimEnd();
            truncated = true;
        }

        return text;
    }

    private static string CollapseWhitespace(string s)
    {
        var sb = new StringBuilder(s.Length);
        var pendingSpace = false;
        foreach (var c in s)
        {
            if (char.IsWhiteSpace(c))
            {
                pendingSpace = sb.Length > 0;
                continue;
            }

            if (pendingSpace)
            {
                sb.Append(' ');
                pendingSpace = false;
            }

            sb.Append(c);
        }

        return sb.ToString();
    }
}
