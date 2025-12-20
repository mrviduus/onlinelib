namespace OnlineLib.Extraction.Contracts;

public sealed record ExtractionMetadata(
    string? Title,
    string? Authors,
    string? Language,
    string? Description
);
