using System.Text.Json;
using ModelContextProtocol.Protocol;
using TextStack.Ai.Mcp.Http;

namespace TextStack.Ai.Mcp.Tools;

/// <summary>
/// The runtime catalog of MCP tools the server exposes. AI-047 shipped
/// <c>search_books</c>; AI-048a appended 5 READ tools (<c>get_book</c>,
/// <c>get_chapter</c>, <c>list_my_highlights</c>, <c>list_my_vocabulary</c>,
/// <c>ask_book</c>); AI-048b appends the first WRITE tool (<c>save_highlight</c>),
/// completing the 7-tool surface. <c>tools/list</c> and <c>tools/call</c> are served
/// from this list, so adding a tool is a single append + its handler.
///
/// Tool handlers contain only validation + mapping. Upstream timeout / transport
/// / parse faults are handled centrally by <see cref="InvokeAsync"/> so every tool
/// returns a clean <c>IsError</c> instead of a JSON-RPC protocol fault, while a
/// genuine caller cancellation still propagates.
///
/// User-scoped tools (highlights / vocabulary / ask) require a Bearer token; when
/// none is available they return a clean auth-required <c>IsError</c> and never
/// issue the HTTP call. All tools are ALWAYS listed (stable discovery) regardless
/// of token presence — only the call fails-clean.
/// </summary>
public sealed class McpToolCatalog
{
    private readonly IReadOnlyDictionary<string, McpToolDescriptor> _byName;

    public McpToolCatalog(TextStackApiClient api)
    {
        var tools = new[]
        {
            BuildSearchBooks(api),
            BuildGetBook(api),
            BuildGetChapter(api),
            BuildListMyHighlights(api),
            BuildListMyVocabulary(api),
            BuildAskBook(api),
            BuildSaveHighlight(api),
        };
        _byName = tools.ToDictionary(t => t.Name, StringComparer.Ordinal);
    }

    public List<Tool> ListTools() =>
        _byName.Values.Select(d => d.ToProtocolTool()).ToList();

    /// <summary>
    /// Dispatches a <c>tools/call</c>. Unknown tool → an <c>IsError</c> result
    /// (per MCP convention, tool-level failures are returned, not thrown).
    /// </summary>
    public Task<CallToolResult> CallAsync(string name, JsonElement? arguments, CancellationToken ct)
    {
        if (!_byName.TryGetValue(name, out var descriptor))
            return Task.FromResult(Error($"Unknown tool '{name}'."));

        return descriptor.Handler(arguments, ct);
    }

    // ── shared upstream-error wrapper ────────────────────────────────────────────

    /// <summary>
    /// Runs a tool's upstream call + mapping with uniform fail-clean semantics so
    /// every handler shares one error contract:
    ///   • genuine caller cancellation (token IS cancelled) → rethrows (SDK ends call);
    ///   • HttpClient timeout (cancel surfaces but caller token NOT cancelled) →
    ///     "{tool} failed: upstream timed out";
    ///   • transport (DNS/connection) or parse (non-JSON body) → "{tool} failed: upstream unavailable";
    ///   • <see cref="McpUnauthorizedException"/> → "authentication required …" (user-scoped tools).
    /// The handler body is only validation + the upstream call + mapping.
    /// </summary>
    private static async Task<CallToolResult> InvokeAsync(
        string tool, CancellationToken ct, Func<Task<CallToolResult>> body)
    {
        try
        {
            return await body();
        }
        // Missing/invalid token (no token configured, device flow pending, or API
        // answered 401). Clean, expected — never an HTTP fault to surface as
        // "unavailable". For a pending device flow, render the actionable
        // verification URL + code so the user can authorize and retry; otherwise
        // relay the provider's reason (e.g. "no TEXTSTACK_MCP_TOKEN configured").
        catch (McpUnauthorizedException ex)
        {
            return Error(ex.VerificationUri is { } uri && ex.UserCode is { } code
                ? $"authentication required — open {uri} and enter code {code} to connect TextStack, then retry."
                : $"authentication required — {ex.Message}");
        }
        // Real client cancellation (client disconnected) is cooperative — propagate
        // so the SDK ends the call. Only a TIMEOUT (HttpClient's own timeout also
        // surfaces as OperationCanceledException, but with the caller's token NOT
        // cancelled) becomes a clean tool error.
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Error($"{tool} failed: upstream timed out");
        }
        // Transport (DNS/connection) or parse (non-JSON 200 body) failure → clean
        // MCP tool error, not a JSON-RPC protocol fault. Do NOT leak stack traces,
        // inner URLs, or exception text to the model.
        catch (Exception ex) when (ex is HttpRequestException or JsonException)
        {
            return Error($"{tool} failed: upstream unavailable");
        }
        // Catch-all: a mapping defect (e.g. a 200 with a well-formed JSON body whose
        // shape leaves a required collection/member null, NRE-ing the LINQ projection)
        // must NOT escape as an opaque JSON-RPC -32603 protocol fault. Keep the
        // protocol stream intact and return a clean, non-leaking tool error.
        // EXCLUDES OperationCanceledException so genuine caller cancellation (token
        // IS cancelled) still propagates and the SDK ends the call cooperatively.
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Error($"{tool} failed: unexpected error");
        }
    }

    // ── search_books ──────────────────────────────────────────────────────────

    private static readonly JsonElement SearchBooksSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "query": { "type": "string", "minLength": 2, "maxLength": 200 },
            "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
          },
          "required": ["query"],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildSearchBooks(TextStackApiClient api) => new()
    {
        Name = "search_books",
        Description = "Search the TextStack library for books and chapters matching a query.",
        InputSchema = SearchBooksSchema,
        Handler = (args, ct) =>
        {
            if (!TryReadSearchArgs(args, out var query, out var limit, out var validationError))
                return Task.FromResult(Error(validationError));

            return InvokeAsync("search_books", ct, async () =>
            {
                var page = await api.SearchBooksAsync(query, limit, ct);
                var results = page.Items.Select(hit => new
                {
                    title = hit.Edition.Title,
                    author = hit.Edition.Authors ?? "",
                    chapterTitle = hit.ChapterTitle ?? "",
                    editionSlug = hit.Edition.Slug,
                    snippet = hit.Highlights is { Count: > 0 } h ? h[0] : "",
                });
                return Text(JsonSerializer.Serialize(new { results }));
            });
        },
    };

    // ── get_book ────────────────────────────────────────────────────────────────

    private static readonly JsonElement GetBookSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "slug": { "type": "string", "minLength": 1, "maxLength": 300 }
          },
          "required": ["slug"],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildGetBook(TextStackApiClient api) => new()
    {
        Name = "get_book",
        Description = "Fetch a catalog book by slug: its editionId (for ask_book), metadata, authors, genres, and chapter list.",
        InputSchema = GetBookSchema,
        Handler = (args, ct) =>
        {
            if (!ArgReader.TryObject(args, out var obj, out var err, "slug")
                || !ArgReader.TryRequiredString(obj, "slug", 1, 300, out var slug, out err))
                return Task.FromResult(Error(err));

            return InvokeAsync("get_book", ct, async () =>
            {
                var book = await api.GetBookAsync(slug, ct);
                if (book is null)
                    return Error($"get_book: no book found for slug '{slug}'");

                var mapped = new
                {
                    // editionId — chainable into ask_book (search → get_book → ask).
                    editionId = book.Id,
                    title = book.Title,
                    slug = book.Slug,
                    language = book.Language,
                    description = book.Description ?? "",
                    authors = (book.Authors ?? []).Select(a => a.Name).ToArray(),
                    genres = (book.Genres ?? []).Select(g => g.Name).ToArray(),
                    chapters = (book.Chapters ?? []).Select(c => new
                    {
                        chapterNumber = c.ChapterNumber,
                        slug = c.Slug,
                        title = c.Title,
                        wordCount = c.WordCount,
                    }),
                };
                return Text(JsonSerializer.Serialize(mapped));
            });
        },
    };

    // ── get_chapter ───────────────────────────────────────────────────────────

    private static readonly JsonElement GetChapterSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "slug": { "type": "string", "minLength": 1, "maxLength": 300 },
            "chapterSlug": { "type": "string", "minLength": 1, "maxLength": 300 }
          },
          "required": ["slug", "chapterSlug"],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildGetChapter(TextStackApiClient api) => new()
    {
        Name = "get_chapter",
        Description = "Fetch a chapter's plain text (HTML stripped, length-capped) plus its number, title, and prev/next slugs.",
        InputSchema = GetChapterSchema,
        Handler = (args, ct) =>
        {
            if (!ArgReader.TryObject(args, out var obj, out var err, "slug", "chapterSlug")
                || !ArgReader.TryRequiredString(obj, "slug", 1, 300, out var slug, out err)
                || !ArgReader.TryRequiredString(obj, "chapterSlug", 1, 300, out var chapterSlug, out err))
                return Task.FromResult(Error(err));

            return InvokeAsync("get_chapter", ct, async () =>
            {
                var chapter = await api.GetChapterAsync(slug, chapterSlug, ct);
                if (chapter is null)
                    return Error($"get_chapter: no chapter '{chapterSlug}' in book '{slug}'");

                var text = HtmlText.StripAndCap(chapter.Html, HtmlText.DefaultMaxChars, out var truncated);
                var mapped = new
                {
                    chapterNumber = chapter.ChapterNumber,
                    slug = chapter.Slug,
                    title = chapter.Title,
                    prevSlug = chapter.Prev?.Slug,
                    nextSlug = chapter.Next?.Slug,
                    truncated,
                    text,
                };
                return Text(JsonSerializer.Serialize(mapped));
            });
        },
    };

    // ── list_my_highlights ──────────────────────────────────────────────────────

    private static readonly JsonElement ListMyHighlightsSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "editionId": { "type": "string", "format": "uuid" }
          },
          "required": ["editionId"],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildListMyHighlights(TextStackApiClient api) => new()
    {
        Name = "list_my_highlights",
        Description = "List the signed-in user's highlights for a given edition (requires authentication).",
        InputSchema = ListMyHighlightsSchema,
        Handler = (args, ct) =>
        {
            if (!ArgReader.TryObject(args, out var obj, out var err, "editionId")
                || !ArgReader.TryRequiredGuid(obj, "editionId", out var editionId, out err))
                return Task.FromResult(Error(err));

            return InvokeAsync("list_my_highlights", ct, async () =>
            {
                var highlights = await api.GetHighlightsAsync(editionId, ct);
                var mapped = highlights.Select(h => new
                {
                    id = h.Id,
                    chapterId = h.ChapterId,
                    color = h.Color,
                    selectedText = h.SelectedText,
                    noteText = h.NoteText,
                    createdAt = h.CreatedAt,
                });
                return Text(JsonSerializer.Serialize(new { highlights = mapped }));
            });
        },
    };

    // ── list_my_vocabulary ──────────────────────────────────────────────────────

    private static readonly JsonElement ListMyVocabularySchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "stage": { "type": "integer", "minimum": 0, "maximum": 4 },
            "search": { "type": "string", "maxLength": 100 },
            "limit": { "type": "integer", "minimum": 1, "maximum": 100 },
            "offset": { "type": "integer", "minimum": 0 }
          },
          "required": [],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildListMyVocabulary(TextStackApiClient api) => new()
    {
        Name = "list_my_vocabulary",
        Description = "List the signed-in user's saved vocabulary words, optionally filtered by SRS stage or search (requires authentication).",
        InputSchema = ListMyVocabularySchema,
        Handler = (args, ct) =>
        {
            if (!ArgReader.TryObject(args, out var obj, out var err, "stage", "search", "limit", "offset")
                || !ArgReader.TryOptionalInt(obj, "stage", 0, 4, out var stage, out err)
                || !ArgReader.TryOptionalString(obj, "search", 100, out var search, out err)
                || !ArgReader.TryOptionalInt(obj, "limit", 1, 100, out var limit, out err)
                || !ArgReader.TryOptionalInt(obj, "offset", 0, int.MaxValue, out var offset, out err))
                return Task.FromResult(Error(err));

            return InvokeAsync("list_my_vocabulary", ct, async () =>
            {
                var page = await api.GetVocabularyAsync(stage, search, limit, offset, ct);
                var items = page.Items.Select(w => new
                {
                    word = w.Word,
                    language = w.Language,
                    translation = w.Translation,
                    definition = w.Definition,
                    stage = w.Stage,
                    bookTitle = w.BookTitle,
                    nextReviewAt = w.NextReviewAt,
                });
                return Text(JsonSerializer.Serialize(new { total = page.Total, items }));
            });
        },
    };

    // ── ask_book ────────────────────────────────────────────────────────────────

    private static readonly JsonElement AskBookSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "editionId": { "type": "string", "format": "uuid" },
            "question": { "type": "string", "minLength": 3, "maxLength": 1000 },
            "k": { "type": "integer", "minimum": 1, "maximum": 20 }
          },
          "required": ["editionId", "question"],
          "additionalProperties": false
        }
        """).RootElement;

    private static McpToolDescriptor BuildAskBook(TextStackApiClient api) => new()
    {
        Name = "ask_book",
        Description = "Ask a question about a book the user is reading; spoiler-safe (answers only from chapters already read). Requires authentication.",
        InputSchema = AskBookSchema,
        Handler = (args, ct) =>
        {
            if (!ArgReader.TryObject(args, out var obj, out var err, "editionId", "question", "k")
                || !ArgReader.TryRequiredGuid(obj, "editionId", out var editionId, out err)
                || !ArgReader.TryRequiredString(obj, "question", 3, 1000, out var question, out err)
                || !ArgReader.TryOptionalInt(obj, "k", 1, 20, out var k, out err))
                return Task.FromResult(Error(err));

            return InvokeAsync("ask_book", ct, async () =>
            {
                var answer = await api.AskAsync(editionId, question, k, ct);
                if (answer is null)
                    return Error("ask_book failed: upstream unavailable");

                // Spoiler gate: not an error — the user simply hasn't read far
                // enough. Return clean text so the model relays it as-is.
                if (answer.Insufficient)
                    return Text("you haven't read far enough in this book to answer yet");

                var mapped = new
                {
                    answer = answer.Answer,
                    citations = answer.Citations.Select(c => new
                    {
                        marker = c.Marker,
                        chapterOrd = c.ChapterOrd,
                        preview = c.Preview,
                    }),
                };
                return Text(JsonSerializer.Serialize(mapped));
            });
        },
    };

    // ── save_highlight (Bearer, WRITE) ───────────────────────────────────────────

    // The agent-providable fields only. No DOM-anchor blob is accepted — Claude
    // Desktop has no reader DOM, so the bridge synthesizes a minimal text-quote
    // anchor server-side (see SynthesizeAnchor). color is a small enum (reader's
    // palette) defaulting to "yellow".
    private static readonly JsonElement SaveHighlightSchema = JsonDocument.Parse(
        """
        {
          "type": "object",
          "properties": {
            "editionId": { "type": "string", "format": "uuid" },
            "chapterId": { "type": "string", "format": "uuid" },
            "selectedText": { "type": "string", "minLength": 1, "maxLength": 5000 },
            "color": { "type": "string", "enum": ["yellow", "green", "blue", "pink"] },
            "noteText": { "type": "string", "maxLength": 2000 }
          },
          "required": ["editionId", "chapterId", "selectedText"],
          "additionalProperties": false
        }
        """).RootElement;

    // Match the web reader's HighlightColor palette (offlineDb.ts) — no "orange".
    private static readonly string[] HighlightColors = ["yellow", "green", "blue", "pink"];

    private static McpToolDescriptor BuildSaveHighlight(TextStackApiClient api) => new()
    {
        Name = "save_highlight",
        Description =
            "Saves a highlight to YOUR TextStack library for the given catalog book chapter "
            + "(WRITE on your own account — requires you to be signed in). Pass the editionId "
            + "and chapterId (from get_book), the exact selected text, and optionally a color "
            + "and a note. The highlight is stored and listable via list_my_highlights.",
        InputSchema = SaveHighlightSchema,
        Handler = (args, ct) =>
        {
            if (!ArgReader.TryObject(args, out var obj, out var err, "editionId", "chapterId", "selectedText", "color", "noteText")
                || !ArgReader.TryRequiredGuid(obj, "editionId", out var editionId, out err)
                || !ArgReader.TryRequiredGuid(obj, "chapterId", out var chapterId, out err)
                || !ArgReader.TryRequiredString(obj, "selectedText", 1, 5000, out var selectedText, out err)
                || !ArgReader.TryOptionalString(obj, "noteText", 2000, out var noteText, out err)
                || !TryReadColor(obj, out var color, out err))
                return Task.FromResult(Error(err));

            // No DOM → synthesize a W3C text-quote anchor from the agent's args.
            // The web reader's findTextByAnchor matches on `exact` first, so a
            // single-occurrence quote re-anchors; otherwise it stays saved + listable.
            var anchorJson = SynthesizeAnchor(chapterId, selectedText);

            return InvokeAsync("save_highlight", ct, async () =>
            {
                var saved = await api.SaveHighlightAsync(editionId, chapterId, anchorJson, color, selectedText, noteText, ct);
                if (saved is null)
                    return Error("save_highlight failed: the book or chapter was not found, or the save was rejected");

                var mapped = new
                {
                    id = saved.Id,
                    chapterId = saved.ChapterId,
                    color = saved.Color,
                    selectedText = saved.SelectedText,
                    noteText = saved.NoteText,
                    createdAt = saved.CreatedAt,
                    saved = true,
                };
                return Text(JsonSerializer.Serialize(mapped));
            });
        },
    };

    // Optional color: absent → "yellow"; present must be one of the reader palette.
    private static bool TryReadColor(JsonElement obj, out string color, out string error)
    {
        color = "yellow";
        if (!ArgReader.TryOptionalString(obj, "color", 20, out var raw, out error))
            return false;
        if (raw is null)
            return true;
        if (Array.IndexOf(HighlightColors, raw) < 0)
        {
            error = $"'color' must be one of: {string.Join(", ", HighlightColors)}.";
            return false;
        }
        color = raw;
        return true;
    }

    // Minimal W3C text-quote anchor (matches the reader's TextAnchor shape) the API
    // stores in its jsonb anchor column. No DOM offsets are available from an MCP
    // client, so prefix/suffix are empty and offsets are quote-relative; the reader
    // re-anchors by `exact`.
    private static string SynthesizeAnchor(Guid chapterId, string selectedText) =>
        JsonSerializer.Serialize(new
        {
            prefix = "",
            exact = selectedText,
            suffix = "",
            startOffset = 0,
            endOffset = selectedText.Length,
            chapterId = chapterId.ToString(),
            source = "mcp",
        });

    // ── search_books arg validation (mirrors the input schema) ───────────────────

    private static bool TryReadSearchArgs(
        JsonElement? args,
        out string query,
        out int? limit,
        out string error)
    {
        query = "";
        limit = null;

        if (!ArgReader.TryObject(args, out var obj, out error, "query", "limit"))
            return false;

        if (!ArgReader.TryRequiredString(obj, "query", 2, 200, out query, out error))
            return false;

        if (!ArgReader.TryOptionalInt(obj, "limit", 1, 50, out limit, out error))
            return false;

        return true;
    }

    // ── MCP result helpers ──────────────────────────────────────────────────────

    private static CallToolResult Text(string text) => new()
    {
        Content = [new TextContentBlock { Text = text }],
    };

    private static CallToolResult Error(string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = message }],
    };
}
