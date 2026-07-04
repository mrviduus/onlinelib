namespace Contracts.ReadingTracking;

// Book Stats DTOs
public record BookStatsResponse(
    int BooksFinished,
    int TotalPages,
    double AvgDaysToFinish,
    List<GenreStatDto> GenreStats,
    List<AuthorStatDto> AuthorStats,
    List<LanguageStatDto> LanguageStats,
    List<BooksOverTimeDto> BooksOverTime,
    List<BookLengthBucketDto> BookLengthDistribution,
    List<PaceStatDto> PaceStats,
    List<ReadingTimeStatDto> ReadingTimeByGenre,
    List<ReadingTimeStatDto> ReadingTimeByAuthor,
    List<int> AvailableYears
);

public record GenreStatDto(string Name, string Slug, int Count);
public record AuthorStatDto(string Name, string Slug, int Count);
public record LanguageStatDto(string Language, int Count);
public record BooksOverTimeDto(string Period, int Books, int Pages);
public record BookLengthBucketDto(string Bucket, int Count);
public record PaceStatDto(string Pace, int Count);
public record ReadingTimeStatDto(string Name, string Slug, long Seconds);
