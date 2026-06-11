using System.Runtime.CompilerServices;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OpenAI;
using OpenAI.Chat;
using TextStack.Ai.Core;

namespace TextStack.Ai.Llm;

/// <summary>
/// OpenAI provider for the new <see cref="ILlmService"/> seam. Ported 1:1 from
/// Application/LLM/OpenAiLlmService.cs — DO NOT "clean up" the reasoning-budget
/// padding. Stateless and thread-safe (ChatClient is thread-safe); registered
/// as a singleton in AI-005.
/// </summary>
public sealed class OpenAiLlmClient : ILlmService
{
    private readonly ChatClient _client;
    private readonly string _model;
    private readonly int _reasoningBudget;
    private readonly ILogger<OpenAiLlmClient> _logger;

    public OpenAiLlmClient(IConfiguration config, ILogger<OpenAiLlmClient> logger, string? modelOverride = null)
    {
        _logger = logger;

        // Treat an empty/whitespace value as "not configured" — otherwise an empty
        // string flows into the OpenAI SDK and surfaces as a cryptic
        // "Value cannot be an empty string. (Parameter 'key')" deep in the call stack
        // (this exact trap cost a debugging session when the worker lacked the key).
        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("OPENAI_API_KEY not configured (OpenAI:ApiKey / OPENAI_API_KEY is empty)");

        // modelOverride lets a second instance (e.g. the eval judge) run a different,
        // stronger model than the default generation model — without it every OpenAI
        // caller is pinned to OpenAI:Model.
        _model = modelOverride
            ?? config["OpenAI:Model"]
            ?? Environment.GetEnvironmentVariable("OPENAI_MODEL")
            ?? "gpt-4.1-nano";

        // Reasoning models (gpt-5, o1, o3…) spend tokens on internal reasoning
        // before visible output. MaxOutputTokenCount caps the COMBINED total, so
        // we pad the caller's budget with a reserve. Non-reasoning models just
        // get a harmless higher ceiling. (Verbatim from the legacy service.)
        _reasoningBudget = int.TryParse(config["OpenAI:ReasoningTokenBudget"], out var rb) ? rb : 512;

        _client = new OpenAIClient(apiKey).GetChatClient(_model);
    }

    private static List<ChatMessage> BuildMessages(LlmRequest request)
    {
        var messages = new List<ChatMessage> { new SystemChatMessage(request.SystemPrompt) };
        foreach (var m in request.Messages)
        {
            messages.Add(m.Role.ToLowerInvariant() switch
            {
                "assistant" => new AssistantChatMessage(m.Content),
                "system" => new SystemChatMessage(m.Content),
                _ => new UserChatMessage(m.Content),
            });
        }
        return messages;
    }

    public async Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
    {
        var messages = BuildMessages(request);

        var maxTokens = request.MaxOutputTokens + _reasoningBudget; // +512 padding quirk
        var options = new ChatCompletionOptions { MaxOutputTokenCount = maxTokens };

        var result = await _client.CompleteChatAsync(messages, options, ct);
        var completion = result.Value;

        var text = completion.Content.FirstOrDefault()?.Text ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            _logger.LogWarning(
                "OpenAI returned empty content (finish={Finish}, maxOutputTokens={Max})",
                completion.FinishReason, maxTokens);
        }

        var inputTokens = completion.Usage?.InputTokenCount ?? 0;
        var outputTokens = completion.Usage?.OutputTokenCount ?? 0;
        if (!ModelPricing.IsPriced(_model))
            _logger.LogWarning("No pricing entry for OpenAI model {Model}; cost recorded as 0", _model);

        var usage = new LlmUsage(inputTokens, outputTokens, ModelPricing.CostUsd(_model, inputTokens, outputTokens));

        // ToolCalls left empty: function-calling is not ported in AI-002 (legacy
        // was text-only). request.Tools is ignored for now.
        // TODO(AI-0xx): map tool definitions + tool_calls when agents land.
        return new LlmResponse(text.Trim(), [], usage, _model, Guid.NewGuid());
    }

    public async IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
    {
        var messages = BuildMessages(request);
        var maxTokens = request.MaxOutputTokens + _reasoningBudget; // +512 padding quirk (same as CompleteAsync)
        var options = new ChatCompletionOptions { MaxOutputTokenCount = maxTokens };

        // Real token streaming: yield each content fragment as it arrives, then a terminal usage delta.
        // The SDK surfaces token usage on the final update (it requests stream_options.include_usage);
        // if absent (older endpoints), usage falls back to 0 — text + latency are still traced.
        ChatTokenUsage? usage = null;
        await foreach (var update in _client.CompleteChatStreamingAsync(messages, options, ct))
        {
            foreach (var part in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(part.Text))
                    yield return new LlmDelta(TextDelta: part.Text);
            }
            if (update.Usage is not null)
                usage = update.Usage;
        }

        var inputTokens = usage?.InputTokenCount ?? 0;
        var outputTokens = usage?.OutputTokenCount ?? 0;
        if (!ModelPricing.IsPriced(_model))
            _logger.LogWarning("No pricing entry for OpenAI model {Model}; cost recorded as 0", _model);

        yield return new LlmDelta(
            FinalUsage: new LlmUsage(inputTokens, outputTokens, ModelPricing.CostUsd(_model, inputTokens, outputTokens)),
            ModelId: _model);
    }
}
