namespace Application.LLM;

public interface ILlmService
{
    Task<string> CompleteAsync(
        string systemPrompt,
        string userPrompt,
        int maxOutputTokens,
        CancellationToken ct);
}
