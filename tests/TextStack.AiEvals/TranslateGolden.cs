namespace TextStack.AiEvals;

/// <summary>One Translate golden: an input the endpoint would receive plus a
/// reference translation the judge scores the model's output against.</summary>
public record TranslateGolden(
    string Text,
    string SourceLang,
    string TargetLang,
    string? Genre,
    string? Sentence,
    string ExpectedTranslation);
