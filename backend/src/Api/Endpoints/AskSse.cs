using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Application.Rag;
using Contracts.Books;

namespace Api.Endpoints;

/// <summary>
/// Shared "Ask this book" plumbing for the catalog + user-book endpoints (AI-028): content negotiation,
/// the JSON-response projection, and the SSE event stream. Mirrors <see cref="ExplainEndpoints"/>: an
/// <c>Accept: text/event-stream</c> request gets <c>delta</c> events (one per token fragment) then a
/// terminal <c>done</c> carrying <c>{ citations, lastReadOrd, insufficient }</c>; a failure mid-stream
/// emits a terminal <c>error</c> event. Buffering is disabled so Cloudflare/nginx don't hold the stream.
/// </summary>
public static class AskSse
{
    private const int PreviewChars = 200;

    // Match ASP.NET Core's default camelCase JSON (Results.Ok) so SSE + JSON citations are identical.
    private static readonly JsonSerializerOptions DoneJson = new(JsonSerializerDefaults.Web);

    /// <summary>True when the caller asked for an SSE token stream.</summary>
    public static bool WantsSse(HttpContext httpContext) =>
        httpContext.Request.Headers.Accept.Any(v =>
            v is not null && v.Contains("text/event-stream", StringComparison.OrdinalIgnoreCase));

    /// <summary>Projects the service answer onto the public JSON contract (citations → previews).</summary>
    public static AskResponse ToResponse(AskAnswer answer)
    {
        var citations = answer.Citations.Select(ToCitation).ToList();
        return new AskResponse(answer.Answer, citations, answer.LastReadOrd, answer.Insufficient);
    }

    /// <summary>
    /// SSE response over a service <see cref="AskStreamItem"/> stream. Disables proxy buffering, then
    /// relays text deltas as <c>delta</c> events and the terminal item as <c>done</c> (or <c>error</c>).
    /// </summary>
    public static IResult Stream(
        HttpContext httpContext,
        Func<CancellationToken, IAsyncEnumerable<AskStreamItem>> source,
        ILogger logger)
    {
        // Cloudflare/nginx must not buffer the stream.
        httpContext.Response.Headers["X-Accel-Buffering"] = "no";
        httpContext.Response.Headers.CacheControl = "no-cache";

        return TypedResults.ServerSentEvents(
            StreamEventsAsync(source, ex => logger.LogError(ex, "Ask stream failed"), httpContext.RequestAborted));
    }

    /// <summary>
    /// Maps service stream items to SSE items: a <c>delta</c> per text fragment, a terminal <c>done</c>
    /// (serialized citations + gating), or a terminal <c>error</c>. Provider resolution can throw before
    /// the first item — the service surfaces that as an <see cref="AskStreamItem.Error"/>. Pure over its
    /// delegate so it's unit-tested directly.
    /// </summary>
    public static async IAsyncEnumerable<SseItem<string>> StreamEventsAsync(
        Func<CancellationToken, IAsyncEnumerable<AskStreamItem>> source,
        Action<Exception>? onException = null,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        IAsyncEnumerable<AskStreamItem>? stream = null;
        string? error = null;
        try
        {
            stream = source(ct);
        }
        catch (Exception ex)
        {
            onException?.Invoke(ex);
            error = "Ask is temporarily unavailable.";
        }

        if (error is not null)
        {
            yield return new SseItem<string>(error, "error");
            yield break;
        }

        await using var e = stream!.GetAsyncEnumerator(ct);
        while (true)
        {
            AskStreamItem item;
            string? moveError = null;
            try
            {
                if (!await e.MoveNextAsync())
                    break;
                item = e.Current;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw; // client disconnected — nothing to emit
            }
            catch (Exception ex)
            {
                onException?.Invoke(ex);
                moveError = "Ask is temporarily unavailable.";
                item = new AskStreamItem();
            }

            if (moveError is not null)
            {
                yield return new SseItem<string>(moveError, "error");
                yield break;
            }

            if (item.Error is { } err)
            {
                yield return new SseItem<string>(err, "error");
                yield break;
            }

            if (item.TextDelta is { Length: > 0 } fragment)
            {
                yield return new SseItem<string>(fragment, "delta");
            }
            else if (item.Terminal is { } terminal)
            {
                yield return Done(terminal);
            }
        }
    }

    private static SseItem<string> Done(AskTerminal terminal)
    {
        var citations = terminal.Citations.Select(ToCitation).ToList();
        var payload = JsonSerializer.Serialize(new
        {
            citations,
            lastReadOrd = terminal.LastReadOrd,
            insufficient = terminal.Insufficient,
        }, DoneJson);
        return new SseItem<string>(payload, "done");
    }

    private static AskCitation ToCitation(AskCitationSource c) =>
        new(c.Marker, c.Chunk.ChunkId, c.Chunk.ChapterId, c.Chunk.ChapterOrd,
            c.Chunk.CharStart, c.Chunk.CharEnd, Preview(c.Chunk.Text));

    private static string Preview(string text) =>
        text.Length <= PreviewChars ? text : text[..PreviewChars] + "…";
}
