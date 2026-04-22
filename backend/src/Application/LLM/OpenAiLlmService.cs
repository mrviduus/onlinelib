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

    public OpenAiLlmService(IConfiguration config, ILogger<OpenAiLlmService> logger)
    {
        _logger = logger;

        var apiKey = config["OpenAI:ApiKey"]
            ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY")
            ?? throw new InvalidOperationException("OPENAI_API_KEY not configured");

        var model = config["OpenAI:Model"]
            ?? Environment.GetEnvironmentVariable("OPENAI_MODEL")
            ?? "gpt-5-mini";

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
            MaxOutputTokenCount = maxOutputTokens,
        };

        var result = await _client.CompleteChatAsync(messages, options, ct);
        var text = result.Value.Content.FirstOrDefault()?.Text ?? string.Empty;
        return text.Trim();
    }
}
