namespace TextStack.Ai.EvalSuite;

/// <summary>One Explain golden case: an input the endpoint would receive plus a
/// reference explanation the judge scores the model's output against.</summary>
public record ExplainGolden(
    string Word,
    string Sentence,
    string? Genre,
    string TargetLang,
    string ExpectedExplanation);
