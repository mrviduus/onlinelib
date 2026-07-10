using TextStack.Extraction.Enums;

namespace TextStack.Extraction.Contracts;

public sealed record ContentUnit(
    ContentUnitType Type,
    string? Title,
    string? Html,
    string PlainText,
    int OrderIndex,
    int? WordCount = null,
    int? OriginalChapterNumber = null,
    int? PartNumber = null,
    int? TotalParts = null,
    // 1-based physical source-page range for PDF units (null for EPUB/HTML).
    // Powers the "Original layout" PDF reader's chapter→page jump.
    int? SourceStartPage = null,
    int? SourceEndPage = null
);
