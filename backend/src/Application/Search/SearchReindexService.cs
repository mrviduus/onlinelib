using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TextStack.Search.Abstractions;
using TextStack.Search.Contracts;
using TextStack.Search.Enums;

namespace Application.Search;

public sealed class SearchReindexService
{
    private const int BatchSize = 500;

    private readonly IAppDbContext _db;
    private readonly ISearchIndexer _indexer;
    private readonly ILogger<SearchReindexService> _logger;

    public SearchReindexService(
        IAppDbContext db,
        ISearchIndexer indexer,
        ILogger<SearchReindexService> logger)
    {
        _db = db;
        _indexer = indexer;
        _logger = logger;
    }

    public async Task<(int Editions, int Chapters)> ReindexAllAsync(CancellationToken ct = default)
    {
        var editions = await _db.Editions
            .Where(e => e.Status == EditionStatus.Published)
            .Include(e => e.Work)
            .Include(e => e.Chapters)
            .Include(e => e.EditionAuthors)
                .ThenInclude(ea => ea.Author)
            .AsNoTracking()
            .ToListAsync(ct);

        _logger.LogInformation("Reindexing {Count} published editions", editions.Count);

        var totalChapters = 0;
        var batch = new List<IndexDocument>();

        foreach (var edition in editions)
        {
            var language = edition.Language.ToLowerInvariant() switch
            {
                "en" => SearchLanguage.En,
                _ => SearchLanguage.Auto
            };

            var authors = string.Join(", ",
                edition.EditionAuthors.OrderBy(ea => ea.Order).Select(ea => ea.Author.Name));

            foreach (var chapter in edition.Chapters)
            {
                batch.Add(new IndexDocument(
                    Id: chapter.Id.ToString(),
                    Title: chapter.Title ?? $"Chapter {chapter.ChapterNumber}",
                    Content: chapter.PlainText ?? string.Empty,
                    Language: language,
                    SiteId: edition.Work.SiteId,
                    Metadata: new Dictionary<string, object>
                    {
                        ["chapterId"] = chapter.Id,
                        ["chapterSlug"] = chapter.Slug ?? string.Empty,
                        ["chapterTitle"] = chapter.Title ?? string.Empty,
                        ["chapterNumber"] = chapter.ChapterNumber,
                        ["editionId"] = edition.Id,
                        ["editionSlug"] = edition.Slug,
                        ["editionTitle"] = edition.Title,
                        ["language"] = edition.Language,
                        ["authors"] = authors,
                        ["coverPath"] = edition.CoverPath ?? string.Empty
                    }));

                totalChapters++;

                if (batch.Count >= BatchSize)
                {
                    await _indexer.IndexBatchAsync(batch, ct);
                    _logger.LogInformation("Indexed batch of {Count} chapters", batch.Count);
                    batch.Clear();
                }
            }
        }

        if (batch.Count > 0)
        {
            await _indexer.IndexBatchAsync(batch, ct);
            _logger.LogInformation("Indexed final batch of {Count} chapters", batch.Count);
        }

        _logger.LogInformation("Reindex complete: {Editions} editions, {Chapters} chapters",
            editions.Count, totalChapters);

        return (editions.Count, totalChapters);
    }
}
