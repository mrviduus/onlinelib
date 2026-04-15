namespace TextStack.Vocabulary;

public interface IDistractorGenerator
{
    Task<(List<string>? Distractors, string? Hint, string? Explanation)> GenerateAsync(
        string word, string language, string? definition, string? sentence,
        string nativeLanguage, CancellationToken ct);
}
