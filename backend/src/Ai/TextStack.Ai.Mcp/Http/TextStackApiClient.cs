using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TextStack.Ai.Mcp.Http;

/// <summary>
/// Thin, stateless client over the existing public TextStack HTTP API.
///
/// AI-047 only needs <see cref="SearchBooksAsync"/> (bridges the MCP
/// <c>search_books</c> tool to <c>GET /search?q=</c>). The MCP server reuses the
/// real endpoint — including its validation, site resolution, and (later) the
/// spoiler gate — instead of touching the DB. AI-048+ append more methods here.
///
/// The Host header is set per-request so <c>SiteContextMiddleware</c> can resolve
/// the site for the otherwise-unauthenticated <c>/search</c> call.
/// </summary>
public sealed class TextStackApiClient
{
    private readonly HttpClient _http;
    private readonly string _siteHost;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public TextStackApiClient(HttpClient http, McpBridgeOptions options)
    {
        _http = http;
        _siteHost = options.SiteHost;
    }

    /// <summary>
    /// Calls <c>GET /search?q={query}&amp;limit={limit}</c> and returns the
    /// paginated chapter hits. A non-success status is treated as "no data" and
    /// returns an empty result. Transport (DNS/connection), timeout, and parse
    /// (non-JSON body) failures THROW (<see cref="HttpRequestException"/>,
    /// <see cref="OperationCanceledException"/>, <see cref="JsonException"/>) — the
    /// catalog handler maps these to a clean <c>IsError</c> tool result so an
    /// interactive client sees a usable message instead of a protocol fault.
    /// </summary>
    public async Task<PaginatedResult<SearchResultDto>> SearchBooksAsync(
        string query,
        int? limit,
        CancellationToken ct)
    {
        var url = $"/search?q={Uri.EscapeDataString(query)}";
        if (limit is { } l)
            url += $"&limit={l}";

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        // SiteContextMiddleware resolves SiteId from Host; required for /search.
        request.Headers.Host = _siteHost;

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<PaginatedResult<SearchResultDto>>(JsonOptions, ct);
            return result ?? Empty;
        }

        // BadRequest (short/long query), 404 (unknown site), 5xx, etc. → empty.
        return Empty;
    }

    private static readonly PaginatedResult<SearchResultDto> Empty = new(0, []);
}

// ── Local DTOs mirroring the API's JSON (deliberately not a Contracts reference:
//    this bridge is stateless and decoupled from the layered backend). Shapes
//    must match Api/Endpoints/SearchEndpoints.cs. ────────────────────────────────

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
