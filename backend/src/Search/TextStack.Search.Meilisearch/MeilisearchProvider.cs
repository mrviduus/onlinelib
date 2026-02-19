using Meilisearch;
using Microsoft.Extensions.Options;
using TextStack.Search.Abstractions;
using TextStack.Search.Contracts;
using MeiliSearchResult = Meilisearch.SearchResult<System.Collections.Generic.Dictionary<string, object?>>;

namespace TextStack.Search.Meilisearch;

public sealed class MeilisearchProvider : ISearchProvider
{
    private readonly MeilisearchClient _client;
    private readonly string _chaptersIndex;
    private readonly string _editionsIndex;

    public MeilisearchProvider(MeilisearchClient client, IOptions<MeilisearchOptions> options)
    {
        _client = client;
        var prefix = options.Value.IndexPrefix;
        _chaptersIndex = $"{prefix}_chapters";
        _editionsIndex = $"{prefix}_editions";
    }

    public async Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
            return SearchResult.Empty;

        var idx = _client.Index(_chaptersIndex);

        var searchParams = new SearchQuery
        {
            Filter = $"siteId = \"{request.SiteId}\"",
            Offset = request.Offset,
            Limit = request.Limit,
            AttributesToRetrieve = ["id", "title", "language", "siteId", "chapterId", "chapterSlug",
                "chapterTitle", "chapterNumber", "editionId", "editionSlug", "editionTitle", "authors", "coverPath"],
            AttributesToCrop = ["content"],
            CropLength = 80,
            AttributesToHighlight = request.IncludeHighlights ? ["content"] : null,
            HighlightPreTag = "<mark>",
            HighlightPostTag = "</mark>",
            ShowRankingScore = true
        };

        var searchable = await idx.SearchAsync<Dictionary<string, object?>>(
            request.Query, searchParams, ct);
        var result = (MeiliSearchResult)searchable;

        var hits = new List<SearchHit>();
        foreach (var doc in result.Hits)
        {
            var metadata = new Dictionary<string, object>();
            SetMeta(metadata, doc, "chapterId", asGuid: true);
            SetMeta(metadata, doc, "chapterSlug");
            SetMeta(metadata, doc, "chapterTitle");
            SetMetaInt(metadata, doc, "chapterNumber");
            SetMeta(metadata, doc, "editionId", asGuid: true);
            SetMeta(metadata, doc, "editionSlug");
            SetMeta(metadata, doc, "editionTitle");
            SetMeta(metadata, doc, "language");
            SetMeta(metadata, doc, "authors");
            SetMeta(metadata, doc, "coverPath");

            var highlights = new List<Highlight>();
            if (request.IncludeHighlights && doc.TryGetValue("_formatted", out var formatted) && formatted != null)
            {
                var hlStr = ExtractFormattedContent(formatted);
                if (hlStr != null && hlStr.Contains("<mark>"))
                    highlights.Add(Highlight.Create("content", hlStr));
            }

            var score = 0.0;
            if (doc.TryGetValue("_rankingScore", out var rankScore))
            {
                score = rankScore switch
                {
                    double d => d,
                    float f => f,
                    _ => 0.0
                };
            }

            hits.Add(new SearchHit(
                doc.TryGetValue("id", out var id) ? id?.ToString() ?? "" : "",
                score,
                highlights,
                metadata));
        }

        return new SearchResult(hits, result.EstimatedTotalHits, [], []);
    }

    public async Task<IReadOnlyList<Suggestion>> SuggestAsync(
        string prefix, Guid siteId, int limit = 10, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(prefix))
            return [];

        var idx = _client.Index(_editionsIndex);

        var searchParams = new SearchQuery
        {
            Filter = $"siteId = \"{siteId}\"",
            Limit = limit,
            ShowRankingScore = true
        };

        var searchable = await idx.SearchAsync<Dictionary<string, object?>>(
            prefix, searchParams, ct);

        return searchable.Hits.Select(doc =>
        {
            var score = 0.0;
            if (doc.TryGetValue("_rankingScore", out var rs))
                score = rs is double d ? d : 0.0;

            return new Suggestion(
                GetStr(doc, "title"),
                GetStr(doc, "slug"),
                GetStr(doc, "authors"),
                GetStr(doc, "coverPath"),
                score);
        }).ToList();
    }

    private static void SetMeta(Dictionary<string, object> meta, Dictionary<string, object?> doc,
        string key, bool asGuid = false)
    {
        if (!doc.TryGetValue(key, out var val) || val == null) return;
        if (asGuid && Guid.TryParse(val.ToString(), out var g))
            meta[key] = g;
        else
            meta[key] = val.ToString() ?? "";
    }

    private static void SetMetaInt(Dictionary<string, object> meta, Dictionary<string, object?> doc, string key)
    {
        if (!doc.TryGetValue(key, out var val) || val == null) return;
        meta[key] = val switch
        {
            int i => i,
            long l => (int)l,
            double d => (int)d,
            _ => int.TryParse(val.ToString(), out var i) ? i : 0
        };
    }

    private static string? ExtractFormattedContent(object formatted)
    {
        if (formatted is System.Text.Json.JsonElement je && je.ValueKind == System.Text.Json.JsonValueKind.Object &&
            je.TryGetProperty("content", out var contentEl))
            return contentEl.GetString();

        if (formatted is Dictionary<string, object?> dict &&
            dict.TryGetValue("content", out var val))
            return val?.ToString();

        return null;
    }

    private static string GetStr(Dictionary<string, object?> doc, string key) =>
        doc.TryGetValue(key, out var v) ? v?.ToString() ?? "" : "";
}
