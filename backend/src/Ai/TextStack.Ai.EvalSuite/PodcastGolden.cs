namespace TextStack.Ai.EvalSuite;

/// <summary>One podcast golden: a book (title/author), its curated Description (the
/// primary anchor for the intro) and a short opening Excerpt. The judge scores the
/// generated 2-host intro for faithfulness/naturalness/structure.</summary>
public record PodcastGolden(string Title, string? Author, string Description, string Excerpt);
