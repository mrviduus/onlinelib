using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Application.Common.Interfaces;
using Domain.LLM;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class ExplainEndpoints
{
    public static void MapExplainEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/explain").WithTags("Explain");
        group.MapPost("", Explain).WithName("Explain").RequireRateLimiting("explain");
    }

    private static async Task<IResult> Explain(
        [FromBody] ExplainRequest request,
        IConfiguration config,
        ILlmServiceFactory llmFactory,
        IAppDbContext db,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        var maxWordLength = config.GetValue("Explain:MaxWordLength", 100);
        var maxSentenceLength = config.GetValue("Explain:MaxSentenceLength", 800);
        var cachePath = config.GetValue<string>("Explain:CachePath") ?? "/tmp/explain-cache";
        var cacheTtlDays = config.GetValue("Explain:CacheTtlDays", 30);

        if (string.IsNullOrWhiteSpace(request.Word))
            return Results.BadRequest("Word is required");
        if (request.Word.Length > maxWordLength)
            return Results.BadRequest($"Word exceeds {maxWordLength} chars");
        if (string.IsNullOrWhiteSpace(request.Sentence))
            return Results.BadRequest("Sentence is required");
        if (request.Sentence.Length > maxSentenceLength)
            return Results.BadRequest($"Sentence exceeds {maxSentenceLength} chars");

        var targetLang = string.IsNullOrWhiteSpace(request.TargetLang) ? "en" : request.TargetLang.Split('-')[0];

        var genre = request.Genre;
        if (string.IsNullOrWhiteSpace(genre) && !string.IsNullOrWhiteSpace(request.BookId)
            && Guid.TryParse(request.BookId, out var bookId))
        {
            try
            {
                genre = await db.Editions
                    .Where(e => e.Id == bookId)
                    .SelectMany(e => e.Genres.Select(g => g.Name))
                    .FirstOrDefaultAsync(ct);
                if (string.IsNullOrWhiteSpace(genre))
                {
                    genre = await db.UserBooks
                        .Where(ub => ub.Id == bookId)
                        .Select(ub => ub.Genre)
                        .FirstOrDefaultAsync(ct);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Explain genre lookup failed, using 'general' domain");
            }
        }

        var cacheKey = ComputeCacheKey(request.Word, request.Sentence, genre, targetLang);
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
                    var cachedResp = JsonSerializer.Deserialize<ExplainResponse>(cached);
                    if (cachedResp != null && !string.IsNullOrWhiteSpace(cachedResp.Explanation))
                        return Results.Ok(cachedResp with { Cached = true });
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Explain cache read failed, falling through to LLM");
        }

        var systemPrompt = BuildSystemPrompt(genre, targetLang);
        var userPrompt = BuildUserPrompt(request.Word, request.Sentence);

        try
        {
            var llm = llmFactory.Get("Explain");
            var text = await llm.CompleteAsync(
                systemPrompt,
                userPrompt,
                maxOutputTokens: 200,
                ct);

            if (string.IsNullOrWhiteSpace(text))
                return Results.Problem("LLM returned empty explanation", statusCode: 502);

            var resp = new ExplainResponse(text, request.Word, false);

            try
            {
                await File.WriteAllTextAsync(
                    cacheFile,
                    JsonSerializer.Serialize(resp),
                    ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Explain cache write failed");
            }

            return Results.Ok(resp);
        }
        catch (TaskCanceledException)
        {
            return Results.Problem("Explain request timed out", statusCode: 504);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Explain LLM call failed");
            return Results.Problem(
                detail: "Explain service unavailable",
                statusCode: 503);
        }
    }

    private static string BuildSystemPrompt(string? genre, string targetLang)
    {
        var domain = string.IsNullOrWhiteSpace(genre) ? "general" : genre.Trim();
        return
            $"You explain unfamiliar words or phrases to a reader in context. " +
            $"Domain hint: {domain}. " +
            $"Respond in {targetLang}. " +
            "Write 2-3 sentences. Focus on how the word is used IN THIS SENTENCE, " +
            "not a dictionary definition. If it is a technical term, give the meaning and " +
            "one concrete analogy. No preface, no quotes around the answer, no markdown.";
    }

    private static string BuildUserPrompt(string word, string sentence) =>
        $"Word: {word}\nSentence: {sentence}";

    private static string ComputeCacheKey(string word, string sentence, string? genre, string targetLang)
    {
        var payload = $"{word.ToLowerInvariant()}|{sentence}|{genre ?? ""}|{targetLang}";
        var bytes = Encoding.UTF8.GetBytes(payload);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}

public record ExplainRequest(
    string Word,
    string Sentence,
    string? Genre,
    string? BookId,
    string? TargetLang
);

public record ExplainResponse(
    string Explanation,
    string Word,
    bool Cached
);
