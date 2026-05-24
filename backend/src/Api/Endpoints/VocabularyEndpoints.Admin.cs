using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using TextStack.Vocabulary;

namespace Api.Endpoints;

/// <summary>
/// Admin-side maintenance endpoints. Currently just BackfillDefinitions —
/// crawls VocabularyWords missing a Definition and asks the configured
/// enricher to fill them. Rate-limited by `Task.Delay(200)` per item to
/// be polite to the Free Dictionary API.
/// </summary>
public static partial class VocabularyEndpoints
{
    private static async Task<IResult> BackfillDefinitions(
        IAppDbContext db,
        IDefinitionEnricher enricher,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        var words = await db.VocabularyWords
            .Where(w => w.Definition == null || w.Definition == "")
            .OrderBy(w => w.CreatedAt)
            .Take(500)
            .ToListAsync(ct);

        var enriched = 0;
        var failed = 0;

        foreach (var w in words)
        {
            try
            {
                var def = await enricher.FetchDefinitionAsync(w.Word, w.Language, ct);
                if (def != null)
                {
                    w.Definition = def;
                    enriched++;
                }
                else
                {
                    failed++;
                }
                // Rate limit: Free Dictionary API
                await Task.Delay(200, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Backfill failed for word {Word}", w.Word);
                failed++;
            }
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(new { total = words.Count, enriched, failed });
    }
}
