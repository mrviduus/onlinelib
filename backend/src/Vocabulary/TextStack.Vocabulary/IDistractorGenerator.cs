namespace TextStack.Vocabulary;

public interface IDistractorGenerator
{
    Task<(List<string>? Distractors, string? Hint)> GenerateAsync(
        string word, string language, string? definition, string? sentence,
        CancellationToken ct);
}
