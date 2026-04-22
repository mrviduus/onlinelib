using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Domain.LLM;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class TranslationEndpoints
{
    public static void MapTranslationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/translate").WithTags("Translation");

        group.MapPost("", Translate).WithName("Translate").RequireRateLimiting("translate");
        group.MapGet("/languages", GetLanguages).WithName("GetTranslationLanguages");

        // Also map without /api/ prefix for nginx compatibility
        app.MapPost("/translate", Translate).WithTags("Translation").WithName("TranslateCompat").RequireRateLimiting("translate");
    }

    private static async Task<IResult> Translate(
        [FromBody] TranslateRequest request,
        IConfiguration config,
        ILlmServiceFactory llmFactory,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        var maxLength = config.GetValue("OpenAI:Translate:MaxTextLength", 500);
        var cachePath = config.GetValue<string>("Translate:CachePath") ?? "/tmp/translate-cache";
        var cacheTtlDays = config.GetValue("Translate:CacheTtlDays", 30);

        if (string.IsNullOrWhiteSpace(request.Text))
            return Results.BadRequest("Text is required");

        if (request.Text.Length > maxLength)
            return Results.BadRequest($"Text exceeds maximum length of {maxLength} characters");

        if (string.IsNullOrWhiteSpace(request.SourceLang))
            return Results.BadRequest("Source language is required");

        if (string.IsNullOrWhiteSpace(request.TargetLang))
            return Results.BadRequest("Target language is required");

        var srcLang = request.SourceLang.Split('-')[0];
        var tgtLang = request.TargetLang.Split('-')[0];

        var cacheKey = ComputeCacheKey(request.Text, srcLang, tgtLang);
        var cacheFile = Path.Combine(cachePath, cacheKey + ".json");

        try
        {
            Directory.CreateDirectory(cachePath);
            if (File.Exists(cacheFile))
            {
                var info = new FileInfo(cacheFile);
                if (info.LastWriteTimeUtc > DateTime.UtcNow.AddDays(-cacheTtlDays))
                {
                    var cached = await File.ReadAllTextAsync(cacheFile, ct);
                    var cachedResp = JsonSerializer.Deserialize<TranslateResponse>(cached);
                    if (cachedResp != null && !string.IsNullOrWhiteSpace(cachedResp.TranslatedText))
                        return Results.Ok(cachedResp);
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Translate cache read failed, falling through to LLM");
        }

        var systemPrompt = $"You are a translation engine. Translate from {srcLang} to {tgtLang}. " +
                           "Output ONLY the translated text. No preface, no quotes, no explanation.";

        try
        {
            var llm = llmFactory.Get("Translate");
            var translated = await llm.CompleteAsync(
                systemPrompt,
                request.Text,
                maxOutputTokens: Math.Min(maxLength * 2, 1000),
                ct);

            if (string.IsNullOrWhiteSpace(translated))
                return Results.Problem("Translation returned empty result", statusCode: 502);

            var resp = new TranslateResponse(translated, request.SourceLang, request.TargetLang);

            try
            {
                await File.WriteAllTextAsync(cacheFile, JsonSerializer.Serialize(resp), ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Translate cache write failed");
            }

            return Results.Ok(resp);
        }
        catch (TaskCanceledException)
        {
            return Results.Problem("Translation request timed out", statusCode: 504);
        }
        catch (Exception ex)
        {
            return Results.Problem(
                detail: $"Translation service unavailable: {ex.Message}",
                statusCode: 503
            );
        }
    }

    private static string ComputeCacheKey(string text, string srcLang, string tgtLang)
    {
        var payload = $"{srcLang}|{tgtLang}|{text}";
        var bytes = Encoding.UTF8.GetBytes(payload);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static IResult GetLanguages()
    {
        // Static list — OpenAI handles any BCP47 pair, but clients want a UI list.
        // Matches prior LibreTranslate set + a few extras.
        var languages = new[]
        {
            new LanguageInfo("en", "English"),
            new LanguageInfo("es", "Spanish"),
            new LanguageInfo("fr", "French"),
            new LanguageInfo("de", "German"),
            new LanguageInfo("it", "Italian"),
            new LanguageInfo("pt", "Portuguese"),
            new LanguageInfo("ru", "Russian"),
            new LanguageInfo("uk", "Ukrainian"),
            new LanguageInfo("pl", "Polish"),
            new LanguageInfo("nl", "Dutch"),
            new LanguageInfo("ja", "Japanese"),
            new LanguageInfo("ko", "Korean"),
            new LanguageInfo("zh", "Chinese"),
            new LanguageInfo("ar", "Arabic"),
            new LanguageInfo("tr", "Turkish"),
            new LanguageInfo("hi", "Hindi"),
        };
        return Results.Ok(languages);
    }
}

public record TranslateRequest(
    string Text,
    string SourceLang,
    string TargetLang
);

public record TranslateResponse(
    string TranslatedText,
    string SourceLang,
    string TargetLang
);

public record LanguageInfo(string Code, string Name);
