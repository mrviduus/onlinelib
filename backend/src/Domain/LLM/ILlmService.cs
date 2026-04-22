namespace Domain.LLM;

public interface ILlmService
{
    Task<string> CompleteAsync(
        string systemPrompt,
        string userPrompt,
        int maxOutputTokens,
        CancellationToken ct);
}

public interface ILlmServiceFactory
{
    ILlmService Get(string jobName);
}
