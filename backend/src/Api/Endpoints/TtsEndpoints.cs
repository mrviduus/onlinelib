using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using TextStack.Tts;

namespace Api.Endpoints;

public static class TtsEndpoints
{
    public static void MapTtsEndpoints(this WebApplication app)
    {
        // Note: registered at /tts (not /api/tts) because nginx strips /api prefix
        // via proxy_pass trailing slash. Frontend calls /api/tts → nginx → /tts → here.
        var group = app.MapGroup("/tts").WithTags("TTS");

        group.MapGet("", Synthesize).WithName("Synthesize").RequireRateLimiting("tts");
        // Voices list is cheap (cached, no synthesis) — separate bucket so a
        // burst of voice-list polls doesn't starve the synth budget and vice versa.
        group.MapGet("/voices", GetVoices).WithName("GetTtsVoices").RequireRateLimiting("tts-voices");
    }

    private static async Task<IResult> Synthesize(
        HttpContext http,
        string? text,
        string? lang,
        string? voice,
        double? speed,
        ITtsService tts,
        IOptions<TtsConfiguration> options,
        CancellationToken ct)
    {
        // Bind once via Options instead of `IConfiguration.GetValue` per call.
        // `GetValue` walks the config providers and re-parses the string on
        // every request — Options is cached + already strongly typed, so the
        // hot path is a property read instead of a string lookup + Convert.
        var cfg = options.Value;

        if (string.IsNullOrWhiteSpace(text))
            return Results.BadRequest("Text is required");

        if (text.Length > cfg.MaxTextLength)
            return Results.BadRequest($"Text exceeds maximum length of {cfg.MaxTextLength} characters");

        if (string.IsNullOrWhiteSpace(lang))
            return Results.BadRequest("Language is required");

        // Deterministic ETag from inputs — same (text, lang, voice, speed) always
        // yields the same MP3, so a 304 short-circuit saves both bandwidth and a
        // disk read. Browsers / CDNs can honor this even when IndexedDB cache
        // is cleared.
        var etag = ComputeEtag(text, lang, voice, speed ?? 1.0);
        var responseCacheSeconds = cfg.ResponseCacheSeconds;
        // RFC 9110: If-None-Match may carry a comma-separated list of validators
        // ("a", "b", W/"c") or the wildcard "*". Raw `inm == etag` only matched
        // a single-value header verbatim — multi-value clients (CDNs, fetch-with-
        // multiple-cached-versions) silently missed the 304 and re-downloaded.
        if (http.Request.Headers.TryGetValue("If-None-Match", out var inm) && IfNoneMatchMatches(inm, etag))
        {
            http.Response.StatusCode = StatusCodes.Status304NotModified;
            http.Response.Headers.ETag = etag;
            // RFC 9111 §4.3.4: a 304 SHOULD generate the same Cache-Control,
            // Content-Location, Date, ETag, Expires, and Vary as the 200 would
            // — so intermediaries can refresh stored freshness metadata. Without
            // it, a CDN's cached entry's max-age may not be re-extended on a
            // successful revalidation, forcing a full GET on next request.
            http.Response.Headers.CacheControl = new StringValues($"public, max-age={responseCacheSeconds}, immutable");
            return Results.Empty;
        }

        try
        {
            var audio = await tts.SynthesizeAsync(text, lang, voice, speed ?? 1.0, ct);
            http.Response.Headers.ETag = etag;
            http.Response.Headers.CacheControl = new StringValues($"public, max-age={responseCacheSeconds}, immutable");
            return Results.File(audio, "audio/mpeg", enableRangeProcessing: true);
        }
        catch (TaskCanceledException)
        {
            return Results.Problem("TTS request timed out", statusCode: 504);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Results.Problem(
                detail: $"TTS service error: {ex.Message}",
                statusCode: 502);
        }
    }

    private static string ComputeEtag(string text, string lang, string? voice, double speed)
    {
        var input = $"{text}|{lang}|{voice ?? ""}|{speed:F2}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return $"\"{Convert.ToHexStringLower(hash)[..16]}\"";
    }

    // RFC 9110 §13.1.2: If-None-Match accepts "*", a single ETag, or a
    // comma-separated list. Compare with weak-validator semantics: strip a
    // leading "W/" so W/"abc" matches "abc". Our ETags are always strong, so
    // a weak match-of-strong is acceptable for cache hit purposes.
    //
    // Span-based scan: previous string.Split(',') allocated an intermediate
    // string[] + per-token strings on every TTS request. This walks the header
    // value with IndexOf and slices via ReadOnlySpan<char> — zero allocations
    // on the hot path.
    private static bool IfNoneMatchMatches(StringValues header, string etag)
    {
        var etagSpan = etag.AsSpan();
        foreach (var raw in header)
        {
            if (string.IsNullOrEmpty(raw)) continue;
            var rest = raw.AsSpan();
            while (!rest.IsEmpty)
            {
                int comma = rest.IndexOf(',');
                ReadOnlySpan<char> token;
                if (comma < 0) { token = rest; rest = default; }
                else { token = rest[..comma]; rest = rest[(comma + 1)..]; }

                token = token.Trim();
                if (token.IsEmpty) continue;
                if (token.Length == 1 && token[0] == '*') return true;
                if (token.Length >= 2 && token[0] == 'W' && token[1] == '/')
                    token = token[2..];
                if (token.SequenceEqual(etagSpan)) return true;
            }
        }
        return false;
    }

    private static async Task<IResult> GetVoices(
        string? lang,
        ITtsService tts,
        CancellationToken ct)
    {
        try
        {
            var voices = await tts.GetVoicesAsync(lang, ct);
            return Results.Ok(voices);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Results.Problem("Failed to fetch voices", statusCode: 502);
        }
    }
}
