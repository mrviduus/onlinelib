namespace OnlineLib.Search.Contracts;

public sealed record Suggestion(
    string Text,
    string Slug,
    string? AuthorsJson,
    string? CoverPath,
    double Score
);
