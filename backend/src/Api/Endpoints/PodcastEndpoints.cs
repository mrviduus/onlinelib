using Api.Language;
using Api.Sites;
using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// Phase 3 (AI-015) podcast HTTP surface. Generation is expensive (LLM + TTS + ffmpeg),
/// so enqueueing is **admin-only** (`POST /admin/podcasts`, guarded by AdminAuthMiddleware);
/// status + playback are **public** (`GET /books/{slug}/podcast`). The worker (AI-014)
/// does the actual work; the mp3 is served from the existing <c>/storage</c> static root.
/// </summary>
public static class PodcastEndpoints
{
    public static void MapPodcastEndpoints(this WebApplication app)
    {
        app.MapPost("/admin/podcasts", EnqueuePodcast).WithTags("Podcast").WithName("EnqueuePodcast");
        app.MapGet("/admin/podcasts/{editionId:guid}", GetAdminPodcastStatus).WithTags("Podcast").WithName("GetAdminPodcastStatus");
        app.MapGet("/books/{slug}/podcast", GetPodcastStatus).WithTags("Podcast").WithName("GetPodcastStatus");
    }

    // Admin-only (AdminAuthMiddleware): latest job for an edition, by id — for the
    // admin "Generate podcast" section to poll after triggering.
    private static async Task<IResult> GetAdminPodcastStatus(
        Guid editionId,
        IAppDbContext db,
        CancellationToken ct)
    {
        var job = await db.PodcastGenerationJobs
            .Where(j => j.EditionId == editionId)
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
        return job is null ? Results.NotFound() : Results.Ok(ToDto(job));
    }

    // Admin-only (AdminAuthMiddleware guards /admin/*). Idempotent: returns the existing
    // job if one is already queued/running/succeeded for this edition+language.
    private static async Task<IResult> EnqueuePodcast(
        [FromBody] EnqueuePodcastRequest req,
        IAppDbContext db,
        CancellationToken ct)
    {
        var edition = await db.Editions.FirstOrDefaultAsync(e => e.Id == req.EditionId, ct);
        if (edition is null)
            return Results.NotFound(new { error = "Edition not found" });

        var lang = string.IsNullOrWhiteSpace(req.Lang) ? (edition.Language ?? "en") : req.Lang.Trim();

        var existing = await db.PodcastGenerationJobs
            .Where(j => j.EditionId == edition.Id && j.Lang == lang)
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (existing is not null &&
            existing.Status is PodcastJobStatus.Queued or PodcastJobStatus.Running or PodcastJobStatus.Succeeded)
            return Results.Ok(ToDto(existing));

        var job = new PodcastGenerationJob
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            Lang = lang,
            Status = PodcastJobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.PodcastGenerationJobs.Add(job);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/admin/podcasts/{job.Id}", ToDto(job));
    }

    // Public: latest podcast job for the catalog book (resolved like BooksEndpoints).
    private static async Task<IResult> GetPodcastStatus(
        string slug,
        HttpContext httpContext,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = httpContext.GetSiteId();
        var language = httpContext.GetLanguage();

        var edition = await db.Editions.FirstOrDefaultAsync(
            e => e.SiteId == siteId && e.Slug == slug && e.Language == language && e.Status == EditionStatus.Published, ct);
        if (edition is null)
            return Results.NotFound();

        var job = await db.PodcastGenerationJobs
            .Where(j => j.EditionId == edition.Id && j.Lang == edition.Language)
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (job is null)
            return Results.NotFound();

        return Results.Ok(ToDto(job));
    }

    private static PodcastStatusDto ToDto(PodcastGenerationJob job) => new(
        job.Id,
        job.Status.ToString(),
        job.Status == PodcastJobStatus.Succeeded && !string.IsNullOrEmpty(job.AudioPath)
            ? $"/storage/{job.AudioPath}"
            : null,
        job.DurationSeconds);
}

public record EnqueuePodcastRequest(Guid EditionId, string? Lang);

public record PodcastStatusDto(Guid JobId, string Status, string? AudioUrl, int? DurationSeconds);
