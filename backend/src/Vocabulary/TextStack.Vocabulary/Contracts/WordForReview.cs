namespace TextStack.Vocabulary.Contracts;

public record WordForReview(
    Guid Id, string Word, string Language,
    string? Translation, string? Definition,
    string? Sentence, string? BookTitle, string? Hint,
    string? Explanation, string? DistractorsJson,
    int Stage, int TotalReviews);
