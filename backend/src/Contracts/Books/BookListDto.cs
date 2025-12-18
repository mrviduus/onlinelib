namespace Contracts.Books;

public record BookListDto(
    Guid Id,
    string Slug,
    string Title,
    string Language,
    string? AuthorsJson,
    string? Description,
    string? CoverPath,
    DateTimeOffset? PublishedAt,
    int ChapterCount
);
