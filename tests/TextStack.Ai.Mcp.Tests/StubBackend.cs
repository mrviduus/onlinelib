using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace TextStack.Ai.Mcp.Tests;

/// <summary>
/// A hermetic in-process stub of the TextStack public API — the exact routes the
/// MCP bridge's <c>TextStackApiClient</c> calls, returning canned camelCase JSON
/// matching the client's local DTOs. It RECORDS the last request seen per route
/// (method, path+query, Authorization, Host, body) so the over-the-wire tests can
/// assert the bridge issued the right upstream call.
///
/// Hosted on a loopback port (no Docker, no live API, no external network); the
/// real <c>BuildHttp</c> MCP host is pointed at it via <c>McpBridgeOptions.ApiBaseUrl</c>.
/// </summary>
public sealed class StubBackend : IAsyncDisposable
{
    // Two canned editions: the "good" one answers ask_book; the "spoiler" one
    // returns Insufficient=true (the spoiler-gate variant).
    public const string GoodEdition = "33333333-3333-3333-3333-333333333333";
    public const string SpoilerEdition = "55555555-5555-5555-5555-555555555555";
    public const string ChapterId = "44444444-4444-4444-4444-444444444444";
    public const string NewHighlightId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    private readonly WebApplication _app;
    private readonly Dictionary<string, RecordedRequest> _records = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    public string BaseUrl { get; }

    /// <summary>A snapshot of a single recorded upstream request.</summary>
    public sealed record RecordedRequest(
        string Method, string PathAndQuery, string? Authorization, string? Host, string Body);

    /// <summary>Total upstream requests this stub has served (any route).</summary>
    public int TotalRequests
    {
        get { lock (_gate) return _hits; }
    }

    private int _hits;

    private StubBackend(WebApplication app, string baseUrl)
    {
        _app = app;
        BaseUrl = baseUrl;
    }

    /// <summary>Last request recorded under <paramref name="key"/>, or null.</summary>
    public RecordedRequest? Last(string key)
    {
        lock (_gate)
            return _records.TryGetValue(key, out var r) ? r : null;
    }

    public static async Task<StubBackend> StartAsync(CancellationToken ct)
    {
        var port = FreeTcpPort();
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders(); // keep test output clean
        var app = builder.Build();
        app.Urls.Add($"http://127.0.0.1:{port}");

        var stub = new StubBackend(app, $"http://127.0.0.1:{port}");
        stub.MapRoutes();
        await app.StartAsync(ct);
        return stub;
    }

    private void MapRoutes()
    {
        // GET /search → search page (Dracula hit).
        _app.MapGet("/search", async ctx =>
        {
            await RecordAsync("search", ctx);
            await WriteJsonAsync(ctx, SearchBody);
        });

        // GET /books/{slug} → BookDetail incl. id (=editionId) + chapters.
        _app.MapGet("/books/{slug}", async ctx =>
        {
            await RecordAsync("get_book", ctx);
            await WriteJsonAsync(ctx, BookDetailBody);
        });

        // GET /books/{slug}/chapters/{chapterSlug} → ChapterDto (html, prev/next).
        _app.MapGet("/books/{slug}/chapters/{chapterSlug}", async ctx =>
        {
            await RecordAsync("get_chapter", ctx);
            await WriteJsonAsync(ctx, ChapterBody);
        });

        // GET /me/highlights/{editionId} → 401 if no bearer, else canned list.
        _app.MapGet("/me/highlights/{editionId}", async ctx =>
        {
            await RecordAsync("list_my_highlights", ctx);
            if (!HasBearer(ctx)) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return; }
            await WriteJsonAsync(ctx, HighlightsBody);
        });

        // GET /me/vocabulary/words → 401 if no bearer, else canned page.
        _app.MapGet("/me/vocabulary/words", async ctx =>
        {
            await RecordAsync("list_my_vocabulary", ctx);
            if (!HasBearer(ctx)) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return; }
            await WriteJsonAsync(ctx, VocabularyBody);
        });

        // POST /me/highlights → 401 if no bearer, else 201 HighlightDto.
        _app.MapPost("/me/highlights", async ctx =>
        {
            await RecordAsync("save_highlight", ctx);
            if (!HasBearer(ctx)) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return; }
            await WriteJsonAsync(ctx, CreatedHighlightBody, StatusCodes.Status201Created);
        });

        // POST /books/{editionId}/ask → 401 if no bearer; spoiler edition → Insufficient.
        _app.MapPost("/books/{editionId}/ask", async ctx =>
        {
            await RecordAsync("ask_book", ctx);
            if (!HasBearer(ctx)) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return; }
            var editionId = (string?)ctx.Request.RouteValues["editionId"];
            await WriteJsonAsync(ctx,
                string.Equals(editionId, SpoilerEdition, StringComparison.OrdinalIgnoreCase)
                    ? AskInsufficientBody
                    : AskBody);
        });
    }

    private static bool HasBearer(HttpContext ctx)
    {
        var header = ctx.Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            && header["Bearer ".Length..].Trim().Length > 0;
    }

    private async Task RecordAsync(string key, HttpContext ctx)
    {
        ctx.Request.EnableBuffering();
        string body;
        using (var reader = new StreamReader(ctx.Request.Body, leaveOpen: true))
            body = await reader.ReadToEndAsync();
        ctx.Request.Body.Position = 0;

        var record = new RecordedRequest(
            ctx.Request.Method,
            ctx.Request.Path + ctx.Request.QueryString,
            ctx.Request.Headers.Authorization.Count > 0 ? ctx.Request.Headers.Authorization.ToString() : null,
            ctx.Request.Host.HasValue ? ctx.Request.Host.Value : null,
            body);

        lock (_gate)
        {
            _records[key] = record;
            _hits++;
        }
    }

    private static async Task WriteJsonAsync(HttpContext ctx, string json, int status = StatusCodes.Status200OK)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(json);
    }

    private static int FreeTcpPort()
    {
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    public async ValueTask DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    // ── canned camelCase bodies (mirror TextStackApiClient's local DTOs) ─────────

    private const string SearchBody =
        """
        {
          "total": 1,
          "items": [
            {
              "chapterId": "11111111-1111-1111-1111-111111111111",
              "chapterSlug": "ch-1",
              "chapterTitle": "I",
              "chapterNumber": 1,
              "edition": {
                "id": "33333333-3333-3333-3333-333333333333",
                "slug": "dracula",
                "title": "Dracula",
                "language": "en",
                "authors": "Bram Stoker",
                "coverPath": null
              },
              "highlights": ["the Count <b>Dracula</b> stirred"]
            }
          ]
        }
        """;

    private const string BookDetailBody =
        """
        {
          "id": "33333333-3333-3333-3333-333333333333",
          "slug": "dracula",
          "title": "Dracula",
          "language": "en",
          "description": "A vampire tale.",
          "authors": [{ "id": "1", "slug": "bs", "name": "Bram Stoker", "role": "author" }],
          "genres": [{ "id": "2", "slug": "horror", "name": "Horror" }],
          "chapters": [
            { "id": "44444444-4444-4444-4444-444444444444", "chapterNumber": 1, "slug": "ch-1", "title": "Jonathan Harker's Journal", "wordCount": 4200 },
            { "id": "66666666-6666-6666-6666-666666666666", "chapterNumber": 2, "slug": "ch-2", "title": "Jonathan Harker's Journal Continued", "wordCount": 3900 }
          ]
        }
        """;

    private const string ChapterBody =
        """
        {
          "id": "44444444-4444-4444-4444-444444444444",
          "chapterNumber": 1,
          "slug": "ch-1",
          "title": "Jonathan Harker's Journal",
          "html": "<p>3 May. <b>Bistritz</b>. &mdash; Left Munich at 8:35 P.M.</p>",
          "wordCount": 11,
          "edition": { "id": "33333333-3333-3333-3333-333333333333", "slug": "dracula", "title": "Dracula", "language": "en" },
          "prev": null,
          "next": { "slug": "ch-2", "title": "Jonathan Harker's Journal Continued" }
        }
        """;

    private const string HighlightsBody =
        """
        [
          {
            "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "editionId": "33333333-3333-3333-3333-333333333333",
            "chapterId": "44444444-4444-4444-4444-444444444444",
            "userBookId": null, "userChapterId": null,
            "anchorJson": "{}", "color": "yellow",
            "selectedText": "the dead travel fast", "noteText": "ominous",
            "version": 1,
            "createdAt": "2026-01-01T00:00:00+00:00",
            "updatedAt": "2026-01-01T00:00:00+00:00"
          }
        ]
        """;

    private const string VocabularyBody =
        """
        {
          "total": 1,
          "items": [
            {
              "id": "1", "word": "crepuscular", "language": "en",
              "translation": "сутінковий", "definition": "of twilight",
              "editionId": null, "chapterId": null, "userBookId": null,
              "sentence": null, "bookTitle": "Dracula", "hint": null,
              "stage": 2, "intervalDays": 3, "consecutiveCorrect": 1,
              "nextReviewAt": "2026-02-01T00:00:00+00:00", "lastReviewedAt": null,
              "totalReviews": 4, "correctReviews": 3,
              "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00"
            }
          ]
        }
        """;

    private const string CreatedHighlightBody =
        """
        {
          "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "editionId": "33333333-3333-3333-3333-333333333333",
          "chapterId": "44444444-4444-4444-4444-444444444444",
          "userBookId": null, "userChapterId": null,
          "anchorJson": "{}", "color": "green",
          "selectedText": "Listen to them, the children of the night",
          "noteText": "famous line",
          "version": 1,
          "createdAt": "2026-01-01T00:00:00+00:00",
          "updatedAt": "2026-01-01T00:00:00+00:00"
        }
        """;

    private const string AskBody =
        """
        {
          "answer": "Jonathan Harker travels to Transylvania to meet Count Dracula. [1]",
          "citations": [
            { "marker": 1, "chunkId": "c", "chapterId": "44444444-4444-4444-4444-444444444444", "chapterOrd": 1, "charStart": 0, "charEnd": 9, "preview": "Left Munich at 8:35 P.M." }
          ],
          "lastReadOrd": 2,
          "insufficient": false
        }
        """;

    private const string AskInsufficientBody =
        """
        { "answer": "", "citations": [], "lastReadOrd": 0, "insufficient": true }
        """;
}
