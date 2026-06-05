namespace TextStack.AiEvals;

/// <summary>One BookMetadata golden: title/author the generator receives, plus
/// reference genre/year/description the judge scores the model's GENRE/YEAR/
/// DESCRIPTION output against. ExpectedYear is null for ancient/uncertain works.</summary>
public record BookMetaGolden(
    string Title,
    string? Author,
    string ExpectedGenre,
    int? ExpectedYear,
    string ExpectedDescription);
