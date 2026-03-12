namespace TextStack.Vocabulary;

public interface IDefinitionEnricher
{
    Task<string?> FetchDefinitionAsync(string word, string language, CancellationToken ct);
}
