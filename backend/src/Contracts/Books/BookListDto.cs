namespace Contracts.Books;

public record BookListDto(
    Guid Id,
    string Slug,
    string Title,
    string Language,
    string? Description,
    string? CoverPath,
    DateTimeOffset? PublishedAt,
    int ChapterCount,
    IReadOnlyList<BookAuthorDto> Authors
);

public record BookAuthorDto(
    Guid Id,
    string Slug,
    string Name,
    string Role
);
