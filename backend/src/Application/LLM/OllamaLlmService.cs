using System.Net.Http.Json;
using Domain.LLM;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Application.LLM;

public class OllamaLlmService : ILlmService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<OllamaLlmService> _logger;
    private readonly string _baseUrl;
    private readonly string _model;
    private readonly int _timeoutSeconds;

    public OllamaLlmService(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<OllamaLlmService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _baseUrl = config["Ollama:BaseUrl"]
            ?? Environment.GetEnvironmentVariable("OLLAMA_BASE_URL")
            ?? "http://localhost:11434";
        _model = config["Ollama:Model"]
            ?? Environment.GetEnvironmentVariable("OLLAMA_MODEL")
            ?? "gemma4:e4b";
        _timeoutSeconds = config.GetValue("Ollama:TimeoutSeconds", 30);
    }

    public async Task<string> CompleteAsync(
        string systemPrompt,
        string userPrompt,
        int maxOutputTokens,
        CancellationToken ct)
    {
        // Ollama /api/generate takes a single prompt. Concatenate system + user
        // with a clear separator so the model treats them as role-split.
        var prompt = string.IsNullOrWhiteSpace(systemPrompt)
            ? userPrompt
            : $"{systemPrompt}\n\n{userPrompt}";

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(_timeoutSeconds);

        // think=false disables chain-of-thought on Gemma-4 / Qwen-3 / similar
        // reasoning models. Without this, gemma4:e2b emits a long
        // "Thinking Process: 1. Analyze the Request..." preamble that eats
        // the entire num_predict budget — our parsers (BookMetadataGenerator,
        // DistractorGenerator) then see no GENRE: / DISTRACTORS: lines and
        // every fire-and-forget enrichment call returns null. Backwards
        // compatible: non-thinking models ignore the field.
        var request = new
        {
            model = _model,
            prompt,
            stream = false,
            think = false,
            options = new { num_predict = maxOutputTokens },
        };

        try
        {
            var response = await client.PostAsJsonAsync($"{_baseUrl}/api/generate", request, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Ollama returned {StatusCode}", response.StatusCode);
                return string.Empty;
            }

            var result = await response.Content.ReadFromJsonAsync<OllamaResponse>(ct);
            return result?.Response?.Trim() ?? string.Empty;
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("Ollama request timed out after {Seconds}s", _timeoutSeconds);
            return string.Empty;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Ollama request failed");
            return string.Empty;
        }
    }

    private class OllamaResponse
    {
        public string? Response { get; set; }
    }
}
