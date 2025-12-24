using System.Collections.Concurrent;
using OnlineLib.Search.Abstractions;
using OnlineLib.Search.Contracts;
using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Tests.Mocks;

/// <summary>
/// In-memory search provider for integration-style tests.
/// Provides actual search functionality without a database.
/// </summary>
public sealed class InMemorySearchProvider : ISearchProvider
{
    private readonly ConcurrentDictionary<string, IndexDocument> _documents = new();

    /// <summary>
    /// Gets the number of indexed documents.
    /// </summary>
    public int DocumentCount => _documents.Count;

    /// <summary>
    /// Adds a document to the in-memory index.
    /// </summary>
    public void AddDocument(IndexDocument document)
    {
        _documents[document.Id] = document;
    }

    /// <summary>
    /// Adds multiple documents to the in-memory index.
    /// </summary>
    public void AddDocuments(params IndexDocument[] documents)
    {
        foreach (var doc in documents)
        {
            _documents[doc.Id] = doc;
        }
    }

    /// <summary>
    /// Removes a document from the index.
    /// </summary>
    public bool RemoveDocument(string id) => _documents.TryRemove(id, out _);

    /// <summary>
    /// Clears all documents from the index.
    /// </summary>
    public void Clear() => _documents.Clear();

    public Task<SearchResult> SearchAsync(SearchRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
            return Task.FromResult(SearchResult.Empty);

        var queryTerms = request.Query
            .ToLowerInvariant()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries);

        // Filter and score documents
        var matches = _documents.Values
            .Where(d => d.SiteId == request.SiteId)
            .Where(d => request.Language == SearchLanguage.Auto || d.Language == request.Language)
            .Select(d => new
            {
                Document = d,
                Score = CalculateScore(d, queryTerms)
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .ToList();

        var totalCount = matches.Count;

        var hits = matches
            .Skip(request.Offset)
            .Take(request.Limit)
            .Select(x => CreateHit(x.Document, x.Score, request.IncludeHighlights, queryTerms))
            .ToList();

        return Task.FromResult(SearchResult.FromHits(hits, totalCount));
    }

    public Task<IReadOnlyList<Suggestion>> SuggestAsync(
        string prefix,
        Guid siteId,
        int limit = 10,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(prefix) || prefix.Length < 2)
            return Task.FromResult<IReadOnlyList<Suggestion>>([]);

        var lowerPrefix = prefix.ToLowerInvariant();

        var suggestions = _documents.Values
            .Where(d => d.SiteId == siteId)
            .Where(d => d.Title.ToLowerInvariant().StartsWith(lowerPrefix))
            .GroupBy(d => d.Title.ToLowerInvariant())
            .OrderByDescending(g => g.Count())
            .Take(limit)
            .Select(g =>
            {
                var doc = g.First();
                var slug = doc.Metadata?.TryGetValue("editionSlug", out var s) == true
                    ? s?.ToString() ?? doc.Id
                    : doc.Id;
                var authorsJson = doc.Metadata?.TryGetValue("authorsJson", out var a) == true
                    ? a?.ToString()
                    : null;
                var coverPath = doc.Metadata?.TryGetValue("coverPath", out var c) == true
                    ? c?.ToString()
                    : null;
                return new Suggestion(doc.Title, slug, authorsJson, coverPath, g.Count());
            })
            .ToList();

        // Normalize scores
        if (suggestions.Count > 0)
        {
            var maxScore = suggestions.Max(s => s.Score);
            suggestions = suggestions
                .Select(s => new Suggestion(s.Text, s.Slug, s.AuthorsJson, s.CoverPath, s.Score / maxScore))
                .ToList();
        }

        return Task.FromResult<IReadOnlyList<Suggestion>>(suggestions);
    }

    private static double CalculateScore(IndexDocument doc, string[] queryTerms)
    {
        var titleLower = doc.Title.ToLowerInvariant();
        var contentLower = doc.Content.ToLowerInvariant();

        double score = 0;

        foreach (var term in queryTerms)
        {
            // Title matches are worth more
            if (titleLower.Contains(term))
                score += 2.0;

            // Content matches
            if (contentLower.Contains(term))
                score += 1.0;

            // Exact word match bonus
            if (titleLower.Split(' ').Contains(term))
                score += 1.0;
        }

        return score;
    }

    private static SearchHit CreateHit(
        IndexDocument doc,
        double score,
        bool includeHighlights,
        string[] queryTerms)
    {
        var metadata = new Dictionary<string, object>
        {
            ["title"] = doc.Title,
            ["language"] = doc.Language.ToString()
        };

        if (doc.Metadata != null)
        {
            foreach (var kvp in doc.Metadata)
            {
                metadata[kvp.Key] = kvp.Value;
            }
        }

        var highlights = includeHighlights
            ? CreateHighlights(doc.Content, queryTerms)
            : Array.Empty<Highlight>();

        return new SearchHit(doc.Id, score, highlights, metadata);
    }

    private static Highlight[] CreateHighlights(string content, string[] queryTerms)
    {
        var fragments = new List<string>();
        var contentLower = content.ToLowerInvariant();

        foreach (var term in queryTerms)
        {
            var index = contentLower.IndexOf(term, StringComparison.Ordinal);
            if (index >= 0)
            {
                var start = Math.Max(0, index - 50);
                var end = Math.Min(content.Length, index + term.Length + 50);
                var fragment = content[start..end];

                if (start > 0) fragment = "..." + fragment;
                if (end < content.Length) fragment += "...";

                // Wrap match in bold
                var termInContent = content.Substring(index, term.Length);
                fragment = fragment.Replace(termInContent, $"<b>{termInContent}</b>");

                fragments.Add(fragment);
            }
        }

        if (fragments.Count == 0)
            return [];

        return [Highlight.Create("content", fragments.ToArray())];
    }
}
