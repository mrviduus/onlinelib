using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Api.Endpoints;

/// <summary>
/// Word lookup for the reader, proxying the Free Dictionary API in front of a SHA256 file cache.
///
/// <para><b>Contract.</b> Three outcomes, deliberately distinguishable:
/// <list type="bullet">
///   <item><c>200</c> — a definition. <c>cached</c> says it came off disk; <c>stale</c> says it came
///     off disk past its TTL because upstream was unreachable. Still correct data.</item>
///   <item><c>404</c> <c>{ message, code: "not_found" }</c> — upstream says this word has no
///     definition. A real answer: the client should say "no definition for X".</item>
///   <item><c>503</c> <c>{ message, code: "dictionary_unavailable" }</c> — we could not ask and had
///     nothing cached. NOT an answer: the client should say "try again", not "no such word".</item>
/// </list>
/// Timeouts, connection failures and upstream 5xx all collapse into <c>503 dictionary_unavailable</c>;
/// the distinction between them is an operator concern (it is logged) and not something a reader UI
/// can act on differently. The previous 502/503/504 split gave clients three ways to say the same
/// sentence. <c>X-Dictionary-Cache: hit|stale|miss|negative</c> carries the same information for ops.</para>
///
/// <para><b>No LLM fallback, on purpose.</b> This route is one of three (with <c>/translate</c> and
/// <c>/api/tts</c>) kept anonymous because the reading loop depends on it. Routing misses to
/// <see cref="Application.Ai.ILlmService"/> would put paid inference behind an unauthenticated URL —
/// the exact hole <c>RequireAiAccount</c> closes from the other side.</para>
/// </summary>
public static class DictionaryEndpoints
{
    /// <summary>
    /// A word tap in the reader: the answer is either fast or it is useless. 3s covers a cold DNS +
    /// TLS handshake to the upstream CDN on a mobile network (~1s) plus a slow-but-alive query, and
    /// caps the worst case below the point where a tap reads as broken. The old 10s was a budget for
    /// a batch job, not a gesture — during tonight's outage it bought nothing except ten seconds of
    /// spinner before the same error. With the cache in front, the marginal value of waiting longer
    /// on a miss is small; the marginal cost is the whole interaction.
    /// </summary>
    private const int DefaultTimeoutSeconds = 3;

    private const int DefaultCacheTtlDays = 30;

    /// <summary>
    /// Negative entries expire far sooner than hits. A definition is effectively immutable, but
    /// "no such word" is a statement about coverage, and dictionaries do gain words.
    /// </summary>
    private const int DefaultNegativeCacheTtlHours = 24;

    public static void MapDictionaryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/dictionary").WithTags("Dictionary");

        group.MapGet("/{lang}/{word}", LookupWord).WithName("LookupWord").RequireRateLimiting("dictionary");
    }

    private static async Task<IResult> LookupWord(
        string lang,
        string word,
        HttpContext httpContext,
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        // Validate input
        if (string.IsNullOrWhiteSpace(word))
            return Results.BadRequest("Word is required");

        if (word.Length > 100)
            return Results.BadRequest("Word is too long");

        var langCode = NormalizeLang(lang);
        var trimmedWord = word.Trim();

        var cache = new DictionaryCache(
            config.GetValue<string>("Dictionary:CachePath") ?? "/tmp/dictionary-cache", logger);
        var hitTtl = TimeSpan.FromDays(config.GetValue("Dictionary:CacheTtlDays", DefaultCacheTtlDays));
        var negativeTtl = TimeSpan.FromHours(
            config.GetValue("Dictionary:NegativeCacheTtlHours", DefaultNegativeCacheTtlHours));
        var timeout = TimeSpan.FromSeconds(
            Math.Max(1, config.GetValue("Dictionary:TimeoutSeconds", DefaultTimeoutSeconds)));

        var key = DictionaryCache.ComputeKey(langCode, trimmedWord);
        var cached = await cache.TryReadAsync(key, ct);
        var now = DateTime.UtcNow;

        if (DictionaryPolicy.FromCache(cached, now, hitTtl, negativeTtl) is { } fresh)
            return Respond(httpContext, fresh, trimmedWord);

        // Nothing fresh on disk — ask upstream. Anything we hold is kept as the fallback.
        try
        {
            var client = httpClientFactory.CreateClient();
            // The linked CTS is the only budget: HttpClient.Timeout raises the same
            // TaskCanceledException as a client disconnect, and those need different handling.
            client.Timeout = Timeout.InfiniteTimeSpan;
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeout);

            // Free Dictionary API (powered by Wiktionary)
            var apiUrl = $"https://api.dictionaryapi.dev/api/v2/entries/{langCode}/{Uri.EscapeDataString(trimmedWord)}";
            var response = await client.GetAsync(apiUrl, cts.Token);

            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                await cache.WriteMissAsync(key, now, ct);
                return Respond(
                    httpContext,
                    new DictionaryResolution(DictionaryStatus.NotFound, null, Cached: false, Stale: false),
                    trimmedWord);
            }

            if (!response.IsSuccessStatusCode)
            {
                // 5xx/522/429 — upstream is there but not answering. Same as unreachable.
                logger.LogWarning("Dictionary upstream returned {Status} for {Lang}/{Word}",
                    response.StatusCode, langCode, trimmedWord);
                return Respond(httpContext, DictionaryPolicy.OnUpstreamFailure(cached), trimmedWord);
            }

            var entries = await response.Content.ReadFromJsonAsync<List<DictionaryApiEntry>>(cts.Token);

            if (entries == null || entries.Count == 0)
            {
                await cache.WriteMissAsync(key, now, ct);
                return Respond(
                    httpContext,
                    new DictionaryResolution(DictionaryStatus.NotFound, null, Cached: false, Stale: false),
                    trimmedWord);
            }

            var result = entries[0].ToResponse(trimmedWord);
            await cache.WriteHitAsync(key, result, now, ct);
            return Respond(
                httpContext,
                new DictionaryResolution(DictionaryStatus.Hit, result, Cached: false, Stale: false),
                trimmedWord);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw; // reader navigated away — nothing to serve, nothing to log
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("Dictionary upstream timed out after {Timeout}s for {Lang}/{Word}",
                timeout.TotalSeconds, langCode, trimmedWord);
            return Respond(httpContext, DictionaryPolicy.OnUpstreamFailure(cached), trimmedWord);
        }
        catch (Exception ex) when (ex is HttpRequestException or System.Text.Json.JsonException)
        {
            logger.LogWarning(ex, "Dictionary upstream unreachable for {Lang}/{Word}", langCode, trimmedWord);
            return Respond(httpContext, DictionaryPolicy.OnUpstreamFailure(cached), trimmedWord);
        }
    }

    private static IResult Respond(HttpContext httpContext, DictionaryResolution resolution, string word)
    {
        httpContext.Response.Headers["X-Dictionary-Cache"] = resolution switch
        {
            { Stale: true } => "stale",
            { Cached: true, Status: DictionaryStatus.NotFound } => "negative",
            { Cached: true } => "hit",
            _ => "miss",
        };

        return resolution.Status switch
        {
            DictionaryStatus.Hit => Results.Ok(
                resolution.Entry! with { Cached = resolution.Cached, Stale = resolution.Stale }),
            DictionaryStatus.NotFound => Results.Json(
                new DictionaryErrorResponse($"No definition found for '{word}'", "not_found"),
                statusCode: StatusCodes.Status404NotFound),
            _ => Results.Json(
                new DictionaryErrorResponse(
                    "Dictionary service is temporarily unavailable", "dictionary_unavailable"),
                statusCode: StatusCodes.Status503ServiceUnavailable),
        };
    }

    private static string NormalizeLang(string lang) => lang.ToLowerInvariant() switch
    {
        "en" or "english" => "en",
        "ru" or "russian" => "ru",
        "de" or "german" => "de",
        "fr" or "french" => "fr",
        "es" or "spanish" => "es",
        "pl" or "polish" => "pl",
        "pt" or "portuguese" => "pt",
        "pt-br" or "portuguese-brazil" => "pt", // Free Dictionary API uses 'pt' for both
        _ => lang.ToLowerInvariant()
    };
}

// Response DTOs
public record DictionaryResponse(
    string Word,
    string? Phonetic,
    List<DictionaryMeaning> Definitions
)
{
    /// <summary>Served from the server-side cache rather than a live upstream call.</summary>
    public bool Cached { get; init; }

    /// <summary>Served past its TTL because upstream was unreachable. The data is still correct.</summary>
    public bool Stale { get; init; }
}

public record DictionaryMeaning(
    string PartOfSpeech,
    List<DictionaryDefinition> Definitions
);

public record DictionaryDefinition(
    string Definition,
    string? Example
);

/// <param name="Code">Machine-readable: <c>not_found</c> (upstream answered: no such word) or
/// <c>dictionary_unavailable</c> (we could not ask and had nothing cached).</param>
public record DictionaryErrorResponse(string Message, string Code = "not_found");

// Free Dictionary API response types
file static class DictionaryApiMapper
{
    /// <summary>Upstream shape → our shape. Caps at 3 definitions per part of speech — a word tap
    /// is a glance, and the whole entry would not fit the popup anyway.</summary>
    public static DictionaryResponse ToResponse(this DictionaryApiEntry entry, string fallbackWord) => new(
        Word: entry.Word ?? fallbackWord,
        Phonetic: entry.Phonetics?.FirstOrDefault(p => !string.IsNullOrEmpty(p.Text))?.Text,
        Definitions: entry.Meanings?.Select(m => new DictionaryMeaning(
            PartOfSpeech: m.PartOfSpeech ?? "unknown",
            Definitions: m.Definitions?.Take(3).Select(d => new DictionaryDefinition(
                Definition: d.Definition ?? "",
                Example: d.Example
            )).ToList() ?? []
        )).ToList() ?? []);
}

file class DictionaryApiEntry
{
    [JsonPropertyName("word")]
    public string? Word { get; set; }

    [JsonPropertyName("phonetics")]
    public List<DictionaryApiPhonetic>? Phonetics { get; set; }

    [JsonPropertyName("meanings")]
    public List<DictionaryApiMeaning>? Meanings { get; set; }
}

file class DictionaryApiPhonetic
{
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("audio")]
    public string? Audio { get; set; }
}

file class DictionaryApiMeaning
{
    [JsonPropertyName("partOfSpeech")]
    public string? PartOfSpeech { get; set; }

    [JsonPropertyName("definitions")]
    public List<DictionaryApiDefinition>? Definitions { get; set; }
}

file class DictionaryApiDefinition
{
    [JsonPropertyName("definition")]
    public string? Definition { get; set; }

    [JsonPropertyName("example")]
    public string? Example { get; set; }
}
