namespace Contracts.Books;

public record ChapterDto(
    Guid Id,
    int ChapterNumber,
    string? Slug,
    string Title,
    string Html,
    int? WordCount,
    ChapterEditionDto Edition,
    ChapterNavDto? Prev,
    ChapterNavDto? Next
);

public record ChapterEditionDto(
    Guid Id,
    string Slug,
    string Title,
    string Language
);

public record ChapterNavDto(string? Slug, string Title);
