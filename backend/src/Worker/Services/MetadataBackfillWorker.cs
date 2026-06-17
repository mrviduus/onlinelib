using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Worker.Services;

/// <summary>
/// One-shot backfill: walks user_books with status=Ready and NULL Genre,
/// runs BookMetadataGenerator (Ollama) against each, and writes the result
/// back. Runs once per worker startup with a small per-book delay so we
/// don't hammer Ollama on boot.
/// </summary>
/// <remarks>
/// Why this exists: BookMetadataGenerator was previously failing silently
/// because the worker pointed at <c>http://localhost:11434</c> instead of
/// the <c>ollama</c> service. By the time we fixed the env var, ~10 books
/// were already in DB with Genre=NULL — leaving them stale would mean the
/// domain-aware translation prompt has nothing to bias against. This
/// hosted service heals them without manual intervention.
///
/// Idempotent: only touches NULL Genre rows. Re-running is safe.
/// Bounded: caps at <see cref="MaxPerRun"/> books per startup, sleeps
/// <see cref="DelayBetween"/> between calls.
/// </remarks>
public class MetadataBackfillWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<MetadataBackfillWorker> logger) : BackgroundService
{
    // Defer the run a bit so the rest of the system is up (Ollama may still
    // be loading the gemma4:e2b model into memory on a fresh deploy).
    private static readonly TimeSpan StartDelay = TimeSpan.FromMinutes(2);
    // Tight cap so a misbehaving Ollama can't burn forever on startup.
    private const int MaxPerRun = 50;
    private static readonly TimeSpan DelayBetween = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(StartDelay, stoppingToken);
        }
        catch (OperationCanceledException) { return; }

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
        var generator = scope.ServiceProvider.GetRequiredService<IBookMetadataGenerator>();

        // Pull a snapshot of ids — we don't want to hold a long-lived
        // tracking context while making LLM calls.
        List<Guid> ids;
        try
        {
            ids = await db.UserBooks
                .Where(b => b.Status == UserBookStatus.Ready && b.Genre == null)
                .OrderByDescending(b => b.CreatedAt)
                .Take(MaxPerRun)
                .Select(b => b.Id)
                .ToListAsync(stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Metadata backfill: failed to fetch candidate ids");
            return;
        }

        if (ids.Count == 0)
        {
            logger.LogInformation("Metadata backfill: nothing to do");
            return;
        }

        logger.LogInformation("Metadata backfill: enriching {Count} user books", ids.Count);
        var ok = 0;
        var failed = 0;
        foreach (var id in ids)
        {
            if (stoppingToken.IsCancellationRequested) break;
            try
            {
                using var bookScope = scopeFactory.CreateScope();
                var bookDb = bookScope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var book = await bookDb.UserBooks.FirstOrDefaultAsync(b => b.Id == id, stoppingToken);
                if (book is null || !string.IsNullOrEmpty(book.Genre)) continue;

                var needsDesc = string.IsNullOrEmpty(book.Description);
                var meta = await generator.GenerateAsync(book.Title, book.Author, needsDesc, stoppingToken);
                if (meta is null) { failed++; continue; }

                var changed = false;
                if (meta.Genre != null && string.IsNullOrEmpty(book.Genre))
                { book.Genre = meta.Genre; changed = true; }
                if (meta.PublishedYear != null && book.PublishedYear == null)
                { book.PublishedYear = meta.PublishedYear; changed = true; }
                if (meta.Description != null && string.IsNullOrEmpty(book.Description))
                { book.Description = meta.Description; changed = true; }

                if (changed)
                {
                    book.UpdatedAt = DateTimeOffset.UtcNow;
                    await bookDb.SaveChangesAsync(stoppingToken);
                    ok++;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Metadata backfill: enrichment failed for {BookId}", id);
                failed++;
            }

            try { await Task.Delay(DelayBetween, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }

        logger.LogInformation(
            "Metadata backfill: done. enriched={Ok} failed={Failed} (of {Total} candidates)",
            ok, failed, ids.Count);
    }
}
