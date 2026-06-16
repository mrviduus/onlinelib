using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using TextStack.Ai.Mcp.Auth;

namespace TextStack.Ai.Mcp.Http;

/// <summary>
/// Thin, stateless client over the existing public TextStack HTTP API.
///
/// AI-047 shipped <see cref="SearchBooksAsync"/>. AI-048a adds the read tools:
/// <see cref="GetBookAsync"/> + <see cref="GetChapterAsync"/> (public) and
/// <see cref="GetHighlightsAsync"/> / <see cref="GetVocabularyAsync"/> /
/// <see cref="AskAsync"/> (Bearer, token from <see cref="IMcpTokenProvider"/>).
/// The MCP server reuses the real endpoints — their validation, site resolution,
/// auth, and spoiler gate — instead of touching the DB.
///
/// The Host header is set per-request so <c>SiteContextMiddleware</c> resolves the
/// site (also satisfies <c>LanguageMiddleware</c>'s Site.DefaultLanguage = "en"
/// fallback for bare, unprefixed public routes). User-scoped calls add
/// <c>Authorization: Bearer {token}</c>.
///
/// Non-2xx is treated as "no data" for reads (empty result). A 401 on a
/// user-scoped call surfaces as <see cref="McpUnauthorizedException"/> so the
/// handler can map it to the auth-required message. Transport / timeout / parse
/// failures THROW (<see cref="HttpRequestException"/>,
/// <see cref="OperationCanceledException"/>, <see cref="JsonException"/>) — the
/// catalog's shared wrapper maps these to a clean <c>IsError</c> tool result.
/// </summary>
public sealed class TextStackApiClient
{
    private readonly HttpClient _http;
    private readonly string _siteHost;
    private readonly IMcpTokenProvider _tokenProvider;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public TextStackApiClient(HttpClient http, McpBridgeOptions options, IMcpTokenProvider tokenProvider)
    {
        _http = http;
        _siteHost = options.SiteHost;
        _tokenProvider = tokenProvider;
    }

    // ── search_books (AI-047) ───────────────────────────────────────────────────

    /// <summary>
    /// <c>GET /search?q={query}&amp;limit={limit}</c>. Non-success → empty.
    /// </summary>
    public async Task<PaginatedResult<SearchResultDto>> SearchBooksAsync(
        string query,
        int? limit,
        CancellationToken ct)
    {
        var url = $"/search?q={Uri.EscapeDataString(query)}";
        if (limit is { } l)
            url += $"&limit={l}";

        using var request = PublicRequest(HttpMethod.Get, url);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<PaginatedResult<SearchResultDto>>(JsonOptions, ct);
            return result ?? EmptySearch;
        }

        return EmptySearch;
    }

    // ── get_book (public) ────────────────────────────────────────────────────────

    /// <summary><c>GET /books/{slug}</c>. Not found / non-success → null.</summary>
    public async Task<BookDetailJson?> GetBookAsync(string slug, CancellationToken ct)
    {
        var url = $"/books/{Uri.EscapeDataString(slug)}";
        using var request = PublicRequest(HttpMethod.Get, url);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.OK)
            return await response.Content.ReadFromJsonAsync<BookDetailJson>(JsonOptions, ct);

        return null;
    }

    // ── get_chapter (public) ─────────────────────────────────────────────────────

    /// <summary><c>GET /books/{slug}/chapters/{chapterSlug}</c>. Non-success → null.</summary>
    public async Task<ChapterJson?> GetChapterAsync(string slug, string chapterSlug, CancellationToken ct)
    {
        var url = $"/books/{Uri.EscapeDataString(slug)}/chapters/{Uri.EscapeDataString(chapterSlug)}";
        using var request = PublicRequest(HttpMethod.Get, url);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.OK)
            return await response.Content.ReadFromJsonAsync<ChapterJson>(JsonOptions, ct);

        return null;
    }

    // ── list_my_highlights (Bearer) ──────────────────────────────────────────────

    /// <summary>
    /// <c>GET /me/highlights/{editionId}</c>. 401 → <see cref="McpUnauthorizedException"/>;
    /// other non-success → empty list.
    /// </summary>
    public async Task<IReadOnlyList<HighlightJson>> GetHighlightsAsync(Guid editionId, CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Get, $"/me/highlights/{editionId}", ct);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.Unauthorized)
            throw new McpUnauthorizedException();

        if (response.StatusCode is HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<List<HighlightJson>>(JsonOptions, ct);
            return result ?? [];
        }

        return [];
    }

    // ── list_my_vocabulary (Bearer) ──────────────────────────────────────────────

    /// <summary>
    /// <c>GET /me/vocabulary/words?stage=&amp;search=&amp;limit=&amp;offset=</c>.
    /// Omits any null param (API defaults apply). 401 →
    /// <see cref="McpUnauthorizedException"/>; other non-success → empty.
    /// </summary>
    public async Task<VocabularyPageJson> GetVocabularyAsync(
        int? stage, string? search, int? limit, int? offset, CancellationToken ct)
    {
        var query = new List<string>();
        if (stage is { } s) query.Add($"stage={s}");
        if (!string.IsNullOrEmpty(search)) query.Add($"search={Uri.EscapeDataString(search)}");
        if (limit is { } l) query.Add($"limit={l}");
        if (offset is { } o) query.Add($"offset={o}");
        var url = "/me/vocabulary/words" + (query.Count > 0 ? "?" + string.Join("&", query) : "");

        using var request = await AuthorizedRequestAsync(HttpMethod.Get, url, ct);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.Unauthorized)
            throw new McpUnauthorizedException();

        if (response.StatusCode is HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<VocabularyPageJson>(JsonOptions, ct);
            return result ?? EmptyVocab;
        }

        return EmptyVocab;
    }

    // ── ask_book (Bearer) ────────────────────────────────────────────────────────

    /// <summary>
    /// <c>POST /books/{editionId}/ask</c> with <c>{ question, k }</c>. One POST,
    /// JSON response (NOT SSE). 401 → <see cref="McpUnauthorizedException"/>; other
    /// non-success → null (handler maps to a clean upstream error).
    /// </summary>
    public async Task<AskJson?> AskAsync(Guid editionId, string question, int? k, CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Post, $"/books/{editionId}/ask", ct);
        request.Content = JsonContent.Create(new AskRequestJson(question, k), options: JsonOptions);

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.Unauthorized)
            throw new McpUnauthorizedException();

        if (response.StatusCode is HttpStatusCode.OK)
            return await response.Content.ReadFromJsonAsync<AskJson>(JsonOptions, ct);

        return null;
    }

    // ── request builders ─────────────────────────────────────────────────────────

    // Public route: Host header only (site + EN default-language resolution).
    private HttpRequestMessage PublicRequest(HttpMethod method, string url)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Host = _siteHost;
        return request;
    }

    // User-scoped route: Host header + Bearer. Asks the token provider; a
    // non-Authorized result throws McpUnauthorizedException (carrying the
    // verification URL/code for Pending, or the message for Failed) up front so
    // the HTTP call never leaves the process. The catalog maps it to an
    // actionable IsError.
    private async Task<HttpRequestMessage> AuthorizedRequestAsync(HttpMethod method, string url, CancellationToken ct)
    {
        var token = await _tokenProvider.GetTokenAsync(ct);
        switch (token)
        {
            case TokenResult.Authorized a:
                var request = new HttpRequestMessage(method, url);
                request.Headers.Host = _siteHost;
                request.Headers.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", a.AccessToken);
                return request;
            case TokenResult.Pending p:
                throw new McpUnauthorizedException(verificationUri: p.VerificationUri, userCode: p.UserCode);
            case TokenResult.Failed f:
                throw new McpUnauthorizedException(message: f.Message);
            default:
                throw new McpUnauthorizedException();
        }
    }

    private static readonly PaginatedResult<SearchResultDto> EmptySearch = new(0, []);
    private static readonly VocabularyPageJson EmptyVocab = new(0, []);
}

/// <summary>
/// Typed "no/invalid auth" signal for user-scoped tools. Raised when the token
/// provider can't supply a usable token, or the API answers 401. The catalog maps
/// it to a clean, actionable <c>IsError</c> — it is NOT a transport fault, so the
/// shared wrapper rethrows it for the catalog to translate.
///
/// When a device flow is in progress the provider yields
/// <see cref="TokenResult.Pending"/>, surfaced here via
/// <see cref="VerificationUri"/> + <see cref="UserCode"/> so the catalog can tell
/// the user where to authorize. Otherwise <see cref="Message"/> carries the reason
/// (e.g. "no TEXTSTACK_MCP_TOKEN configured") or the default (401 from the API).
/// </summary>
public sealed class McpUnauthorizedException : Exception
{
    /// <summary>Device-flow verification URL (set only for the Pending case).</summary>
    public string? VerificationUri { get; }

    /// <summary>Device-flow user code (set only for the Pending case).</summary>
    public string? UserCode { get; }

    public McpUnauthorizedException()
        : base("Unauthorized: no valid TextStack token.") { }

    public McpUnauthorizedException(string message)
        : base(message) { }

    public McpUnauthorizedException(string verificationUri, string userCode)
        : base("Unauthorized: device authorization pending.")
    {
        VerificationUri = verificationUri;
        UserCode = userCode;
    }
}

// ── Local DTOs mirroring the API's JSON (deliberately not a Contracts reference:
//    this bridge is stateless and decoupled from the layered backend). Shapes
//    must match the corresponding Api/Endpoints + Contracts records. ────────────

public sealed record PaginatedResult<T>(int Total, IReadOnlyList<T> Items);

public sealed record SearchResultDto(
    Guid ChapterId,
    string? ChapterSlug,
    string? ChapterTitle,
    int ChapterNumber,
    SearchEditionDto Edition,
    IReadOnlyList<string>? Highlights);

public sealed record SearchEditionDto(
    Guid Id,
    string Slug,
    string Title,
    string Language,
    string? Authors,
    string? CoverPath);

// GET /books/{slug} → Contracts.Books.BookDetailDto (subset we surface).
public sealed record BookDetailJson(
    Guid Id,
    string Slug,
    string Title,
    string Language,
    string? Description,
    IReadOnlyList<BookAuthorJson>? Authors,
    IReadOnlyList<BookGenreJson>? Genres,
    IReadOnlyList<ChapterSummaryJson>? Chapters);

public sealed record BookAuthorJson(string Name);

public sealed record BookGenreJson(string Name);

public sealed record ChapterSummaryJson(int ChapterNumber, string? Slug, string Title, int? WordCount);

// GET /books/{slug}/chapters/{chapterSlug} → Contracts.Books.ChapterDto (subset).
public sealed record ChapterJson(
    int ChapterNumber,
    string? Slug,
    string Title,
    string Html,
    ChapterNavJson? Prev,
    ChapterNavJson? Next);

public sealed record ChapterNavJson(string? Slug, string Title);

// GET /me/highlights/{editionId} → HighlightDto[] (subset).
public sealed record HighlightJson(
    Guid Id,
    Guid? ChapterId,
    string Color,
    string SelectedText,
    string? NoteText,
    DateTimeOffset CreatedAt);

// GET /me/vocabulary/words → { total, items: VocabWordDto[] } (subset of items).
public sealed record VocabularyPageJson(int Total, IReadOnlyList<VocabWordJson> Items);

public sealed record VocabWordJson(
    string Word,
    string Language,
    string? Translation,
    string? Definition,
    int Stage,
    string? BookTitle,
    DateTimeOffset NextReviewAt);

// POST /books/{editionId}/ask request + response → Contracts.Books.Ask* (subset).
public sealed record AskRequestJson(string Question, int? K);

public sealed record AskJson(
    string Answer,
    IReadOnlyList<AskCitationJson> Citations,
    int LastReadOrd,
    bool Insufficient);

public sealed record AskCitationJson(int Marker, int ChapterOrd, string Preview);
