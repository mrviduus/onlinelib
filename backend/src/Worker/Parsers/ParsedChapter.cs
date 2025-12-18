namespace Worker.Parsers;

public record ParsedChapter(
    int Order,
    string Title,
    string Html,
    string PlainText,
    int WordCount
);

public record ParsedBook(
    string? Title,
    string? Authors,
    string? Description,
    string? CoverPath,
    List<ParsedChapter> Chapters
);
