using Meilisearch;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TextStack.Search.Meilisearch;

public sealed class MeilisearchInitializer : IHostedService
{
    private readonly MeilisearchClient _client;
    private readonly MeilisearchOptions _options;
    private readonly ILogger<MeilisearchInitializer> _logger;

    public MeilisearchInitializer(
        MeilisearchClient client,
        IOptions<MeilisearchOptions> options,
        ILogger<MeilisearchInitializer> logger)
    {
        _client = client;
        _options = options.Value;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken ct)
    {
        var prefix = _options.IndexPrefix;
        var chaptersIndex = $"{prefix}_chapters";
        var editionsIndex = $"{prefix}_editions";

        _logger.LogInformation("Configuring Meilisearch indexes: {Chapters}, {Editions}",
            chaptersIndex, editionsIndex);

        // Create indexes
        await _client.CreateIndexAsync(chaptersIndex, "id", ct);
        await _client.CreateIndexAsync(editionsIndex, "id", ct);

        // --- Chapters index settings ---
        var chaptersIdx = _client.Index(chaptersIndex);

        await chaptersIdx.UpdateSearchableAttributesAsync(
            ["editionTitle", "authors", "title", "content"], ct);
        await chaptersIdx.UpdateFilterableAttributesAsync(
            ["siteId", "language", "editionId"], ct);
        await chaptersIdx.UpdateDisplayedAttributesAsync(
            ["id", "title", "content", "language", "siteId", "chapterId", "chapterSlug",
             "chapterTitle", "chapterNumber", "editionId", "editionSlug",
             "editionTitle", "authors", "coverPath"], ct);
        await chaptersIdx.UpdateTypoToleranceAsync(new TypoTolerance
        {
            MinWordSizeForTypos = new TypoTolerance.TypoSize { OneTypo = 4, TwoTypos = 8 }
        }, ct);
        await chaptersIdx.UpdateRankingRulesAsync(
            ["words", "typo", "proximity", "attribute", "sort", "exactness"], ct);

        // --- Editions index settings ---
        var editionsIdx = _client.Index(editionsIndex);

        await editionsIdx.UpdateSearchableAttributesAsync(["title", "authors"], ct);
        await editionsIdx.UpdateFilterableAttributesAsync(["siteId", "language"], ct);
        await editionsIdx.UpdateDisplayedAttributesAsync(
            ["id", "title", "slug", "authors", "coverPath", "siteId", "language"], ct);
        await editionsIdx.UpdateTypoToleranceAsync(new TypoTolerance
        {
            MinWordSizeForTypos = new TypoTolerance.TypoSize { OneTypo = 3, TwoTypos = 7 }
        }, ct);
        await editionsIdx.UpdateRankingRulesAsync(
            ["words", "typo", "proximity", "attribute", "sort", "exactness"], ct);

        _logger.LogInformation("Meilisearch indexes configured");
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
