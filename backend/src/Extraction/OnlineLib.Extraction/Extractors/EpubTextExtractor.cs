using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Utilities;
using VersOne.Epub;

namespace OnlineLib.Extraction.Extractors;

public sealed class EpubTextExtractor : ITextExtractor
{
    public SourceFormat SupportedFormat => SourceFormat.Epub;

    public async Task<ExtractionResult> ExtractAsync(ExtractionRequest request, CancellationToken ct = default)
    {
        var warnings = new List<ExtractionWarning>();

        EpubBook book;
        try
        {
            book = await EpubReader.ReadBookAsync(request.Content);
        }
        catch (Exception ex)
        {
            warnings.Add(new ExtractionWarning(
                ExtractionWarningCode.ParseError,
                $"Failed to parse EPUB: {ex.Message}"));

            return new ExtractionResult(
                SourceFormat.Epub,
                new ExtractionMetadata(null, null, null, null),
                [],
                new ExtractionDiagnostics(TextSource.None, null, warnings));
        }

        var title = book.Title;
        var authors = book.AuthorList?.Count > 0 ? string.Join(", ", book.AuthorList) : null;
        var description = book.Description;

        var units = new List<ContentUnit>();
        var order = 0;

        foreach (var textContent in book.ReadingOrder)
        {
            if (ct.IsCancellationRequested)
                break;

            try
            {
                var html = textContent.Content;
                if (string.IsNullOrWhiteSpace(html))
                    continue;

                var (cleanHtml, plainText) = HtmlCleaner.CleanHtml(html);
                if (string.IsNullOrWhiteSpace(plainText))
                    continue;

                var chapterTitle = HtmlCleaner.ExtractTitle(html) ?? $"Chapter {order + 1}";
                var wordCount = HtmlCleaner.CountWords(plainText);

                units.Add(new ContentUnit(
                    Type: ContentUnitType.Chapter,
                    Title: chapterTitle,
                    Html: cleanHtml,
                    PlainText: plainText,
                    OrderIndex: order++,
                    WordCount: wordCount
                ));
            }
            catch (Exception ex)
            {
                warnings.Add(new ExtractionWarning(
                    ExtractionWarningCode.ChapterParseError,
                    $"Failed to parse chapter: {ex.Message}"));
            }
        }

        ct.ThrowIfCancellationRequested();

        // Extract cover image
        byte[]? coverImage = null;
        string? coverMimeType = null;
        try
        {
            var cover = book.CoverImage;
            if (cover != null)
            {
                coverImage = cover;
                // Detect image type from magic bytes
                coverMimeType = DetectImageMimeType(cover);
            }
        }
        catch
        {
            // Cover extraction is optional, don't fail on error
        }

        var metadata = new ExtractionMetadata(title, authors, null, description, coverImage, coverMimeType);
        var diagnostics = new ExtractionDiagnostics(TextSource.NativeText, null, warnings);

        return new ExtractionResult(SourceFormat.Epub, metadata, units, diagnostics);
    }

    private static string DetectImageMimeType(byte[] data)
    {
        if (data.Length < 4)
            return "image/jpeg";

        // JPEG: FF D8 FF
        if (data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
            return "image/jpeg";

        // PNG: 89 50 4E 47
        if (data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47)
            return "image/png";

        // GIF: 47 49 46
        if (data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46)
            return "image/gif";

        // WebP: 52 49 46 46 ... 57 45 42 50
        if (data.Length >= 12 && data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46
            && data[8] == 0x57 && data[9] == 0x45 && data[10] == 0x42 && data[11] == 0x50)
            return "image/webp";

        return "image/jpeg";
    }
}
