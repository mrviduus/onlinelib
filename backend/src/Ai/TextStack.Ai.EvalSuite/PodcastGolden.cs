namespace TextStack.Ai.EvalSuite;

/// <summary>One podcast golden: a book + a source excerpt the generated 2-host dialogue
/// must stay grounded in. The judge scores the dialogue for grounding/naturalness/structure.</summary>
public record PodcastGolden(string Title, string? Author, string Excerpt);
