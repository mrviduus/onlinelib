namespace TextStack.AiEvals;

/// <summary>One vocabulary golden: the inputs DistractorGenerator receives, plus
/// reference distractors/hint/explanation the judge scores the model's (single
/// combined) output against. Explanation reference is in the native language.</summary>
public record VocabGolden(
    string Word,
    string Language,
    string? Definition,
    string? Sentence,
    string NativeLanguage,
    string[] ExpectedDistractors,
    string ExpectedHint,
    string ExpectedExplanation);
