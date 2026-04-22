namespace Contracts.Admin;

public record UserUploadListDto(
    Guid Id,
    string Title,
    string? Author,
    string Language,
    string Status,
    int ChapterCount,
    int? TotalWordCount,
    long FileSize,
    string? SourceFormat,
    string? OriginalFileName,
    string UserEmail,
    bool IsGuest,
    string? ErrorMessage,
    DateTimeOffset CreatedAt,
    DateTimeOffset? TakedownAt,
    string? TakedownReason);

public record TakedownUserBookRequest(string Reason);

public record UserUploadStatsDto(
    int Total,
    int Processing,
    int Ready,
    int Failed,
    int GuestUploads,
    int RegisteredUploads,
    long TotalStorageBytes);
