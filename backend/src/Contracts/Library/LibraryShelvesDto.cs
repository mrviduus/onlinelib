namespace Contracts.Library;

public record LibraryShelvesDto(
    IReadOnlyList<LibraryShelfItemDto> ContinueReading,
    IReadOnlyList<LibraryShelfItemDto> RecentlyAdded,
    IReadOnlyList<LibraryShelfItemDto> QuickReads,
    IReadOnlyList<LibraryShelfItemDto> FinishedThisMonth
);

public record LibraryShelfItemDto(
    Guid Id,
    string Type,
    string Title,
    string? Author,
    string? CoverPath,
    string? Slug,
    string? Language,
    double ProgressPercent,
    DateTimeOffset? LastOpenedAt,
    DateTimeOffset CreatedAt,
    int? EstimatedMinutesRemaining
);
