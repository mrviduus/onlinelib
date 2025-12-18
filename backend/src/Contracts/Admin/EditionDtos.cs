namespace Contracts.Admin;

public record AdminEditionListDto(
    Guid Id,
    string Slug,
    string Title,
    string? AuthorsJson,
    string Status,
    int ChapterCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt
);

public record AdminEditionDetailDto(
    Guid Id,
    Guid WorkId,
    Guid SiteId,
    string Slug,
    string Title,
    string Language,
    string? AuthorsJson,
    string? Description,
    string? CoverPath,
    string Status,
    bool IsPublicDomain,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt,
    List<AdminChapterDto> Chapters
);

public record AdminChapterDto(
    Guid Id,
    int ChapterNumber,
    string Slug,
    string Title,
    int? WordCount
);

public record UpdateEditionRequest(
    string Title,
    string? AuthorsJson,
    string? Description
);
