using Domain.LLM;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OpenAI;
using OpenAI.Chat;

namespace Application.LLM;

public class OpenAiLlmService : ILlmService
{
    private readonly ChatClient _client;
    private readonly ILogger<OpenAiLlmService> _logger;
    private readonly int _reasoningBudget;

    public OpenAiLlmService(IConfiguration config, ILogger<OpenAiLlmService> logger)
    {
        _logger = logger;

        var apiKey = config["OpenAI:ApiKey"]
            ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY")
            ?? throw new InvalidOperationException("OPENAI_API_KEY not configured");

        var model = config["OpenAI:Model"]
            ?? Environment.GetEnvironmentVariable("OPENAI_MODEL")
            ?? "gpt-5-mini";

        // Reasoning models (gpt-5, o1, o3…) consume tokens for internal reasoning
        // before producing visible output. MaxOutputTokenCount caps the combined
        // total, so we pad the caller's desired output budget with a reserve.
        // Non-reasoning models just get a harmless higher ceiling.
        _reasoningBudget = config.GetValue("OpenAI:ReasoningTokenBudget", 512);

        _client = new OpenAIClient(apiKey).GetChatClient(model);
    }

    public async Task<string> CompleteAsync(
        string systemPrompt,
        string userPrompt,
        int maxOutputTokens,
        CancellationToken ct)
    {
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(userPrompt),
        };

        var options = new ChatCompletionOptions
        {
            MaxOutputTokenCount = maxOutputTokens + _reasoningBudget,
        };

        var result = await _client.CompleteChatAsync(messages, options, ct);
        var text = result.Value.Content.FirstOrDefault()?.Text ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            _logger.LogWarning(
                "OpenAI returned empty content (finish={Finish}, maxOutputTokens={Max})",
                result.Value.FinishReason,
                maxOutputTokens + _reasoningBudget);
        }
        return text.Trim();
    }
}
