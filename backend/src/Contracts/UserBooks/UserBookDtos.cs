namespace Contracts.UserBooks;

public record UserBookListDto(
    Guid Id,
    string Title,
    string Slug,
    string Language,
    string? Author,
    string? Description,
    string? CoverPath,
    string? Genre,
    string Status,
    string? ErrorMessage,
    int ChapterCount,
    int? TotalWordCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt,
    double? ProgressPercent,
    DateTimeOffset? ProgressUpdatedAt,
    string? ProgressChapterSlug,
    string[] Tags
);

public record UserBookDetailDto(
    Guid Id,
    string Title,
    string Slug,
    string Language,
    string? Author,
    string? Description,
    string? CoverPath,
    string? Genre,
    int? PublishedYear,
    int? TotalWordCount,
    string Status,
    string? ErrorMessage,
    IReadOnlyList<UserChapterSummaryDto> Chapters,
    IReadOnlyList<TocEntryDto>? Toc,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? CompletedAt
);

public record UserChapterSummaryDto(
    Guid Id,
    int ChapterNumber,
    string? Slug,
    string Title,
    int? WordCount
);

public record UserChapterDto(
    Guid Id,
    int ChapterNumber,
    string? Slug,
    string Title,
    string Html,
    int? WordCount,
    UserChapterNavDto? Previous,
    UserChapterNavDto? Next
);

public record UserChapterNavDto(int ChapterNumber, string? Slug, string Title);

public record TocEntryDto(string Title, int? ChapterNumber, IReadOnlyList<TocEntryDto>? Children);

public record UploadUserBookResponse(Guid UserBookId, Guid JobId, string Status);

public record StorageQuotaDto(long UsedBytes, long LimitBytes, double UsedPercent);

public record UserBookProgressDto(
    string? ChapterSlug,
    string? Locator,
    double? Percent,
    DateTimeOffset? UpdatedAt
);

public record UpsertUserBookProgressRequest(
    string ChapterSlug,
    string? Locator,
    double? Percent,
    DateTimeOffset? UpdatedAt
);

public record UserBookBookmarkDto(
    Guid Id,
    Guid ChapterId,
    string? ChapterSlug,
    string Locator,
    string? Title,
    DateTimeOffset CreatedAt
);

public record CreateUserBookBookmarkRequest(
    Guid ChapterId,
    string Locator,
    string? Title
);

public record UpdateUserBookMetadataRequest(
    string Title,
    string? Author,
    string Language,
    string? Genre,
    string? Description,
    int? PublishedYear
);

public record SetTagsRequest(string[] Tags);

public record TagCountDto(string Tag, int Count);

public record BulkIdsRequest(Guid[] Ids);

public record BulkFinishRequest(Guid[] Ids, bool IsFinished);

public record BulkTagsRequest(Guid[] Ids, string[]? AddTags, string[]? RemoveTags);

public record BulkCollectionRequest(Guid[] Ids, string BookType);

public record BulkResultDto(Guid[] Succeeded, BulkFailureDto[] Failed);

public record BulkFailureDto(Guid Id, string Reason);

public record UserBookSearchHitDto(
    Guid Id,
    string Title,
    string? Author,
    string? CoverPath,
    string Language,
    double Rank,
    string? Excerpt,
    string? ChapterSlug
);

public record BookStatsDto(
    Guid BookId,
    int SessionsCount,
    long TotalReadMinutes,
    int WordsRead,
    int VocabSavedCount,
    int HighlightsCount,
    decimal AverageWordsPerMinute,
    int? EstimatedMinutesRemaining
);
