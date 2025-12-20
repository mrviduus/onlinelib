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

        var metadata = new ExtractionMetadata(title, authors, null, description);
        var diagnostics = new ExtractionDiagnostics(TextSource.NativeText, null, warnings);

        return new ExtractionResult(SourceFormat.Epub, metadata, units, diagnostics);
    }
}
