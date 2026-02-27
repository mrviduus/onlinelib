using TextStack.Tts;

namespace Api.Endpoints;

public static class TtsEndpoints
{
    public static void MapTtsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/tts").WithTags("TTS");

        group.MapGet("", Synthesize).WithName("Synthesize");
        group.MapGet("/voices", GetVoices).WithName("GetTtsVoices");
    }

    private static async Task<IResult> Synthesize(
        string? text,
        string? lang,
        string? voice,
        double? speed,
        ITtsService tts,
        IConfiguration config,
        CancellationToken ct)
    {
        var maxLength = config.GetValue("Tts:MaxTextLength", 500);

        if (string.IsNullOrWhiteSpace(text))
            return Results.BadRequest("Text is required");

        if (text.Length > maxLength)
            return Results.BadRequest($"Text exceeds maximum length of {maxLength} characters");

        if (string.IsNullOrWhiteSpace(lang))
            return Results.BadRequest("Language is required");

        try
        {
            var audio = await tts.SynthesizeAsync(text, lang, voice, speed ?? 1.0, ct);
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
