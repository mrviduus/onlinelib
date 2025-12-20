using System.Text;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;

namespace OnlineLib.Extraction.Utilities;

public static class PlainTextReader
{
    public static async Task<ExtractionResult> ExtractAsync(
        ExtractionRequest request,
        SourceFormat format,
        CancellationToken ct = default)
    {
        var warnings = new List<ExtractionWarning>();
        var text = await ReadTextAsync(request.Content, warnings, ct);
        var normalized = NormalizeText(text);

        var title = ExtractTitleFromFileName(request.FileName);
        var metadata = new ExtractionMetadata(title, null, null, null);

        var units = new List<ContentUnit>();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            warnings.Add(new ExtractionWarning(ExtractionWarningCode.EmptyFile, "File contains no text content"));
        }

        units.Add(new ContentUnit(
            Type: ContentUnitType.Chapter,
            Title: null,
            Html: PlainTextToHtml(normalized),
            PlainText: normalized,
            OrderIndex: 0,
            WordCount: CountWords(normalized)
        ));

        var diagnostics = new ExtractionDiagnostics(TextSource.NativeText, null, warnings);
        return new ExtractionResult(format, metadata, units, diagnostics);
    }

    private static async Task<string> ReadTextAsync(
        Stream stream,
        List<ExtractionWarning> warnings,
        CancellationToken ct)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        try
        {
            return await reader.ReadToEndAsync(ct);
        }
        catch (DecoderFallbackException)
        {
            warnings.Add(new ExtractionWarning(
                ExtractionWarningCode.UnknownEncoding,
                "Could not decode file encoding, using UTF-8 with replacement"));

            stream.Position = 0;
            using var fallbackReader = new StreamReader(
                stream,
                new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: false));
            return await fallbackReader.ReadToEndAsync(ct);
        }
    }

    private static string NormalizeText(string text)
    {
        if (string.IsNullOrEmpty(text))
            return string.Empty;

        // Normalize line endings to LF
        text = text.Replace("\r\n", "\n").Replace("\r", "\n");

        // Trim trailing whitespace per line
        var lines = text.Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            lines[i] = lines[i].TrimEnd();
        }

        return string.Join("\n", lines).Trim();
    }

    private static string? ExtractTitleFromFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return null;

        var name = Path.GetFileNameWithoutExtension(fileName);
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }

    private static int CountWords(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return 0;

        return text.Split([' ', '\t', '\n'], StringSplitOptions.RemoveEmptyEntries).Length;
    }

    private static string PlainTextToHtml(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return string.Empty;

        var escaped = System.Net.WebUtility.HtmlEncode(text);
        var paragraphs = escaped.Split(["\n\n"], StringSplitOptions.RemoveEmptyEntries);
        var htmlParagraphs = paragraphs
            .Select(p => $"<p>{p.Replace("\n", "<br/>")}</p>");

        return string.Join("\n", htmlParagraphs);
    }
}
