using Meilisearch;
using Meilisearch.QueryParameters;
using Microsoft.Extensions.Options;
using TextStack.Search.Abstractions;
using TextStack.Search.Contracts;

namespace TextStack.Search.Meilisearch;

public sealed class MeilisearchIndexer : ISearchIndexer
{
    private readonly MeilisearchClient _client;
    private readonly string _chaptersIndex;
    private readonly string _editionsIndex;

    public MeilisearchIndexer(MeilisearchClient client, IOptions<MeilisearchOptions> options)
    {
        _client = client;
        var prefix = options.Value.IndexPrefix;
        _chaptersIndex = $"{prefix}_chapters";
        _editionsIndex = $"{prefix}_editions";
    }

    public async Task IndexAsync(IndexDocument document, CancellationToken ct = default)
    {
        await IndexBatchAsync([document], ct);
    }

    public async Task IndexBatchAsync(IEnumerable<IndexDocument> documents, CancellationToken ct = default)
    {
        var docs = documents.ToList();
        if (docs.Count == 0) return;

        // Build chapter documents
        var chapterDocs = docs.Select(ToChapterDoc).ToList();

        // Deduplicate editions
        var editionDocs = docs
            .Where(d => d.Metadata != null && d.Metadata.ContainsKey("editionId"))
            .Select(ToEditionDoc)
            .DistinctBy(e => e["id"])
            .ToList();

        var chaptersIdx = _client.Index(_chaptersIndex);
        var editionsIdx = _client.Index(_editionsIndex);

        await chaptersIdx.AddDocumentsAsync(chapterDocs, cancellationToken: ct);

        if (editionDocs.Count > 0)
            await editionsIdx.AddDocumentsAsync(editionDocs, cancellationToken: ct);
    }

    public async Task RemoveAsync(string documentId, CancellationToken ct = default)
    {
        var chaptersIdx = _client.Index(_chaptersIndex);
        await chaptersIdx.DeleteOneDocumentAsync(documentId, cancellationToken: ct);
    }

    public async Task RemoveBySiteAsync(Guid siteId, CancellationToken ct = default)
    {
        var chaptersIdx = _client.Index(_chaptersIndex);
        var editionsIdx = _client.Index(_editionsIndex);

        await chaptersIdx.DeleteDocumentsAsync(
            new DeleteDocumentsQuery { Filter = $"siteId = \"{siteId}\"" }, ct);
        await editionsIdx.DeleteDocumentsAsync(
            new DeleteDocumentsQuery { Filter = $"siteId = \"{siteId}\"" }, ct);
    }

    private static Dictionary<string, object?> ToChapterDoc(IndexDocument doc)
    {
        var meta = doc.Metadata ?? new Dictionary<string, object>();
        return new Dictionary<string, object?>
        {
            ["id"] = doc.Id,
            ["title"] = doc.Title,
            ["content"] = doc.Content,
            ["language"] = doc.Language.ToString().ToLowerInvariant(),
            ["siteId"] = doc.SiteId.ToString(),
            ["chapterId"] = GetString(meta, "chapterId"),
            ["chapterSlug"] = GetString(meta, "chapterSlug"),
            ["chapterTitle"] = GetString(meta, "chapterTitle"),
            ["chapterNumber"] = GetInt(meta, "chapterNumber"),
            ["editionId"] = GetString(meta, "editionId"),
            ["editionSlug"] = GetString(meta, "editionSlug"),
            ["editionTitle"] = GetString(meta, "editionTitle"),
            ["authors"] = GetString(meta, "authors"),
            ["coverPath"] = GetString(meta, "coverPath")
        };
    }

    private static Dictionary<string, object?> ToEditionDoc(IndexDocument doc)
    {
        var meta = doc.Metadata ?? new Dictionary<string, object>();
        var editionId = GetString(meta, "editionId");
        return new Dictionary<string, object?>
        {
            ["id"] = editionId,
            ["title"] = GetString(meta, "editionTitle"),
            ["slug"] = GetString(meta, "editionSlug"),
            ["authors"] = GetString(meta, "authors"),
            ["coverPath"] = GetString(meta, "coverPath"),
            ["siteId"] = doc.SiteId.ToString(),
            ["language"] = doc.Language.ToString().ToLowerInvariant()
        };
    }

    private static string GetString(IReadOnlyDictionary<string, object> meta, string key) =>
        meta.TryGetValue(key, out var v) ? v?.ToString() ?? "" : "";

    private static int GetInt(IReadOnlyDictionary<string, object> meta, string key) =>
        meta.TryGetValue(key, out var v) && v is int i ? i : 0;
}
