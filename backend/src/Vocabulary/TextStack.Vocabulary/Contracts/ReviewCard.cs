namespace TextStack.Vocabulary.Contracts;

public record ReviewCard(
    Guid WordId, string Word, string? Translation, string? Definition,
    string ReviewMode,
    string? BlankSentence, string? OriginalSentence, string? BookTitle,
    string? Hint, string? Explanation,
    bool IsNew,
    List<string>? Options, int? CorrectOptionIndex);
