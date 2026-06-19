using Domain.Entities;
using Infrastructure.Persistence;
using Infrastructure.Rag;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace Worker.Services;

/// <summary>
/// Phase 4 RAG: perpetually embeds <see cref="ChapterChunk"/> rows that the chunker (AI-019)
/// left with a null embedding. Polls <c>WHERE embedding IS NULL</c> in batches and fills them
/// via <see cref="IEmbeddingService"/>, covering both freshly-ingested books and the existing
/// backlog (so AI-021 backfill is just letting this drain). Self-disables when no OpenAI key
/// is configured so a keyless dev host still starts.
/// </summary>
public sealed class ChapterEmbeddingWorker : BackgroundService
{
    private const int BatchSize = 100;
    private static readonly TimeSpan IdlePoll = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan InterBatchDelay = TimeSpan.FromSeconds(1);

    private readonly IDbContextFactory<AppDbContext> _dbFactory;
    private readonly IConfiguration _config;
    private readonly IServiceProvider _services;
    private readonly ILogger<ChapterEmbeddingWorker> _logger;

    // Chunks that fail even per-item are parked in-memory so they don't re-appear at the head
    // of every batch (oldest-first) and force the whole backlog through the slow per-item path.
    private readonly HashSet<Guid> _poisoned = [];

    public ChapterEmbeddingWorker(
        IDbContextFactory<AppDbContext> dbFactory,
        IConfiguration config,
        IServiceProvider services,
        ILogger<ChapterEmbeddingWorker> logger)
    {
        _dbFactory = dbFactory;
        _config = config;
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!HasOpenAiKey())
        {
            _logger.LogInformation("ChapterEmbeddingWorker disabled — no OpenAI key configured.");
            return;
        }

        // Resolved lazily (not ctor-injected) so the worker — and thus the host — still starts
        // when keyless; OpenAiEmbeddingClient throws on construction without a key.
        var embedder = _services.GetRequiredService<IEmbeddingService>();
        _logger.LogInformation("ChapterEmbeddingWorker started (batch={Batch}).", BatchSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await EmbedNextBatchAsync(embedder, stoppingToken);
                await Task.Delay(processed == 0 ? IdlePoll : InterBatchDelay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ChapterEmbeddingWorker cycle failed; retrying after delay.");
                await Task.Delay(IdlePoll, stoppingToken);
            }
        }
    }

    private async Task<int> EmbedNextBatchAsync(IEmbeddingService embedder, CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);

        var poisoned = _poisoned.ToList();
        var batch = await db.ChapterChunks
            .Where(c => c.Embedding == null && !poisoned.Contains(c.Id))
            .OrderBy(c => c.CreatedAt)
            .Take(BatchSize)
            .ToListAsync(ct);

        if (batch.Count == 0)
            return 0;

        try
        {
            var vectors = await embedder.EmbedBatchAsync(batch.Select(c => c.Text).ToList(), ct);
            AssignEmbeddings(batch, vectors);
        }
        catch (Exception ex)
        {
            // One bad text shouldn't stall the whole backlog — embed the rest one by one.
            _logger.LogWarning(ex, "Batch embed failed for {Count} chunks; falling back to per-item.", batch.Count);
            await EmbedPerItemAsync(embedder, batch, ct);
        }

        await db.SaveChangesAsync(ct);

        var touchedEditions = batch.Select(c => c.EditionId).Distinct().ToList();

        // Phase 1 "Ask this book": refresh each touched edition's rag_embedded_count and flip
        // rag_status → Ready (with rag_indexed_at) once every chunk is embedded. Cheap single
        // UPDATE per edition. Runs before the mean-pool recompute so status surfaces ASAP.
        await UpdateRagProgressAsync(db, touchedEditions, ct);

        // AI-054: now that this batch's vectors are persisted, recompute the mean-pool
        // edition embedding for each touched edition that is now FULLY embedded. The
        // fully-embedded guard avoids writing a partial mean on every batch (and avoids
        // per-chunk recompute); editions still draining are caught when their last batch
        // lands (or by the backfill CLI). Best-effort — match the worker's resilience.
        await RecomputeFullyEmbeddedEditionsAsync(db, touchedEditions, ct);

        return batch.Count;
    }

    /// <summary>
    /// For each touched edition, set <c>rag_embedded_count</c> to its current count of embedded
    /// chunks; and when that equals <c>rag_chunk_count</c> (and &gt; 0) flip <c>rag_status</c> to
    /// Ready(2) with <c>rag_indexed_at = now()</c>. One UPDATE per edition. Best-effort: a hiccup
    /// is logged and never stalls the embedding backlog — the next batch (or a final drain) retries.
    /// </summary>
    private async Task UpdateRagProgressAsync(
        AppDbContext db, IReadOnlyList<Guid> editionIds, CancellationToken ct)
    {
        foreach (var editionId in editionIds)
        {
            try
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    UPDATE editions e
                    SET rag_embedded_count = sub.embedded,
                        rag_status = CASE
                            WHEN sub.embedded = e.rag_chunk_count AND e.rag_chunk_count > 0 THEN 2
                            ELSE e.rag_status
                        END,
                        rag_indexed_at = CASE
                            WHEN sub.embedded = e.rag_chunk_count AND e.rag_chunk_count > 0 THEN now()
                            ELSE e.rag_indexed_at
                        END
                    FROM (
                        SELECT count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
                        FROM chapter_chunk
                        WHERE edition_id = {editionId}
                    ) sub
                    WHERE e.id = {editionId};
                    """, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to update RAG progress for edition {EditionId}; will retry next batch.", editionId);
            }
        }
    }

    /// <summary>
    /// For each distinct edition touched by a just-saved batch, recompute its mean-pool
    /// embedding (<see cref="EditionEmbeddingUpdater"/>) IFF no chunk of that edition is
    /// still un-embedded. Runs over the same EF connection. Failures are logged and
    /// swallowed so a recompute hiccup never stalls the embedding backlog.
    /// </summary>
    private async Task RecomputeFullyEmbeddedEditionsAsync(
        AppDbContext db, IEnumerable<Guid> editionIds, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        foreach (var editionId in editionIds.Distinct())
        {
            try
            {
                // Cheap pre-filter: skip issuing the UPDATE for editions still draining (avoids
                // an N+1 round-trip per still-incomplete edition per batch). The mean-pool SQL
                // ALSO self-guards (its NOT EXISTS clause), so this is belt-and-suspenders — the
                // "only fully-embedded editions get a mean" invariant holds even without it.
                var fullyEmbedded = !await db.ChapterChunks
                    .AnyAsync(c => c.EditionId == editionId && c.Embedding == null, ct);
                if (!fullyEmbedded)
                    continue;

                await EditionEmbeddingUpdater.RecomputeAsync(connection, editionId, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to recompute edition embedding for {EditionId}; will retry on next batch or backfill.",
                    editionId);
            }
        }
    }

    private async Task EmbedPerItemAsync(IEmbeddingService embedder, List<ChapterChunk> batch, CancellationToken ct)
    {
        foreach (var chunk in batch)
        {
            try
            {
                chunk.Embedding = await embedder.EmbedAsync(chunk.Text, ct);
            }
            catch (Exception ex)
            {
                _poisoned.Add(chunk.Id);
                _logger.LogWarning(ex, "Failed to embed chunk {ChunkId}; parked for this process lifetime.", chunk.Id);
            }
        }
    }

    /// <summary>Assigns a batch of vectors onto chunks by position (order-preserving).</summary>
    public static void AssignEmbeddings(IReadOnlyList<ChapterChunk> chunks, IReadOnlyList<float[]> vectors)
    {
        if (vectors.Count != chunks.Count)
            throw new InvalidOperationException($"Embedding count {vectors.Count} != chunk count {chunks.Count}");
        for (var i = 0; i < chunks.Count; i++)
            chunks[i].Embedding = vectors[i];
    }

    private bool HasOpenAiKey()
        => !string.IsNullOrWhiteSpace(_config["OpenAI:ApiKey"])
           || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));
}
