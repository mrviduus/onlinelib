using Application.AdminSettings;
using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminAutoPublishEndpoints
{
    private static readonly Guid GeneralSiteId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public static void MapAdminAutoPublishEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/autopublish").WithTags("Auto Publish");

        group.MapGet("/settings", GetSettings);
        group.MapPut("/settings", UpdateSettings);
        group.MapGet("/jobs", GetJobs);
        group.MapGet("/jobs/{id:guid}", GetJob);
        group.MapPost("/jobs/{id:guid}/approve", ApproveJob);
        group.MapPost("/jobs/{id:guid}/reject", RejectJob);
        group.MapPost("/jobs/{id:guid}/retry", RetryJob);
        group.MapPost("/trigger", Trigger);
        group.MapPost("/queue/{editionId:guid}", QueueEdition);
        group.MapGet("/candidates", GetCandidates);
    }

    private static async Task<IResult> GetSettings(AdminSettingsService settings, CancellationToken ct)
    {
        return Results.Ok(new AutoPublishSettingsDto(
            Enabled: await settings.GetBoolAsync("autopublish.enabled", false, ct),
            BooksPerDay: await settings.GetIntAsync("autopublish.booksPerDay", 1, ct),
            HourUtc: await settings.GetIntAsync("autopublish.hourUtc", 10, ct),
            RequireReview: await settings.GetBoolAsync("autopublish.requireReview", false, ct),
            Language: await settings.GetAsync("autopublish.language", "", ct)
        ));
    }

    private static async Task<IResult> UpdateSettings(
        [FromBody] AutoPublishSettingsDto request,
        AdminSettingsService settings,
        CancellationToken ct)
    {
        await settings.SetAsync("autopublish.enabled", request.Enabled.ToString().ToLower(), ct);
        await settings.SetAsync("autopublish.booksPerDay", Math.Clamp(request.BooksPerDay, 1, 10).ToString(), ct);
        await settings.SetAsync("autopublish.hourUtc", Math.Clamp(request.HourUtc, 0, 23).ToString(), ct);
        await settings.SetAsync("autopublish.requireReview", request.RequireReview.ToString().ToLower(), ct);
        await settings.SetAsync("autopublish.language", request.Language ?? "", ct);
        return Results.Ok();
    }

    private static async Task<IResult> GetJobs(
        IAppDbContext db,
        [FromQuery] int offset = 0,
        [FromQuery] int limit = 20,
        [FromQuery] string? status = null,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        offset = Math.Max(offset, 0);

        var query = db.AutoPublishJobs
            .Include(j => j.Edition)
            .AsQueryable();

        if (status != null && Enum.TryParse<AutoPublishJobStatus>(status, true, out var s))
            query = query.Where(j => j.Status == s);

        query = query.OrderByDescending(j => j.CreatedAt);
        var total = await query.CountAsync(ct);
        var items = await query.Skip(offset).Take(limit)
            .Select(j => new AutoPublishJobListDto(
                j.Id, j.EditionId, j.Edition.Title, j.Status.ToString(),
                j.GeneratedEditionSeo, j.GeneratedAuthorSeo, j.Priority,
                j.Error, j.CreatedAt, j.StartedAt, j.FinishedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(new { total, items });
    }

    private static async Task<IResult> GetJob(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var job = await db.AutoPublishJobs
            .Include(j => j.Edition)
            .FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();

        return Results.Ok(new AutoPublishJobDetailDto(
            job.Id, job.EditionId, job.Edition.Title, job.Status.ToString(),
            job.GeneratedEditionSeo, job.GeneratedAuthorSeo, job.Priority,
            job.Error, job.LogOutput, job.CreatedAt, job.StartedAt, job.FinishedAt
        ));
    }

    private static async Task<IResult> ApproveJob(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var job = await db.AutoPublishJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();
        if (job.Status != AutoPublishJobStatus.AwaitingReview)
            return Results.BadRequest(new { error = "Job is not awaiting review" });

        job.Status = AutoPublishJobStatus.Queued;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    private static async Task<IResult> RejectJob(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var job = await db.AutoPublishJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();
        if (job.Status != AutoPublishJobStatus.AwaitingReview)
            return Results.BadRequest(new { error = "Job is not awaiting review" });

        job.Status = AutoPublishJobStatus.Failed;
        job.Error = "Rejected by admin";
        job.FinishedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    private static async Task<IResult> RetryJob(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var job = await db.AutoPublishJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();
        if (job.Status is not (AutoPublishJobStatus.Failed or AutoPublishJobStatus.Cancelled))
            return Results.BadRequest(new { error = "Job is not in a terminal state" });

        job.Status = AutoPublishJobStatus.Queued;
        job.Error = null;
        job.LogOutput = null;
        job.StartedAt = null;
        job.FinishedAt = null;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    private static async Task<IResult> Trigger(IAppDbContext db, AdminSettingsService settings, CancellationToken ct)
    {
        var lang = await settings.GetAsync("autopublish.language", "", ct);

        var query = db.Editions
            .Where(e => e.Status == EditionStatus.Draft)
            .Where(e => e.CoverPath != null && e.CoverPath != "")
            .Where(e => db.AutoPublishJobs
                .All(j => j.EditionId != e.Id ||
                    j.Status == AutoPublishJobStatus.Failed ||
                    j.Status == AutoPublishJobStatus.Cancelled));

        // Ensure edition has chapters
        query = query.Where(e => e.Chapters.Any());

        if (!string.IsNullOrEmpty(lang))
            query = query.Where(e => e.Language == lang);

        var edition = await query.OrderBy(e => e.CreatedAt).FirstOrDefaultAsync(ct);
        if (edition == null)
            return Results.Ok(new { error = "No candidates available" });

        var job = new AutoPublishJob
        {
            Id = Guid.NewGuid(),
            SiteId = GeneralSiteId,
            EditionId = edition.Id,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.AutoPublishJobs.Add(job);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/admin/autopublish/jobs/{job.Id}", new { id = job.Id });
    }

    private static async Task<IResult> QueueEdition(Guid editionId, IAppDbContext db, CancellationToken ct)
    {
        var edition = await db.Editions.FirstOrDefaultAsync(e => e.Id == editionId, ct);
        if (edition == null) return Results.NotFound();
        if (edition.Status != EditionStatus.Draft)
            return Results.BadRequest(new { error = "Edition is not a draft" });

        var existing = await db.AutoPublishJobs
            .AnyAsync(j => j.EditionId == editionId &&
                j.Status != AutoPublishJobStatus.Failed &&
                j.Status != AutoPublishJobStatus.Cancelled, ct);
        if (existing)
            return Results.BadRequest(new { error = "Edition already has an active job" });

        var job = new AutoPublishJob
        {
            Id = Guid.NewGuid(),
            SiteId = GeneralSiteId,
            EditionId = editionId,
            Priority = true,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.AutoPublishJobs.Add(job);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/admin/autopublish/jobs/{job.Id}", new { id = job.Id });
    }

    private static async Task<IResult> GetCandidates(
        IAppDbContext db,
        [FromQuery] int limit = 20,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);

        var candidates = await db.Editions
            .Where(e => e.Status == EditionStatus.Draft)
            .Where(e => e.CoverPath != null && e.CoverPath != "")
            .Where(e => e.Chapters.Any())
            .Where(e => db.AutoPublishJobs
                .All(j => j.EditionId != e.Id ||
                    j.Status == AutoPublishJobStatus.Failed ||
                    j.Status == AutoPublishJobStatus.Cancelled))
            .OrderBy(e => e.CreatedAt)
            .Take(limit)
            .Select(e => new CandidateEditionDto(
                e.Id, e.Title, e.Language,
                e.Chapters.Count(),
                e.Description != null && e.Description != "",
                e.SeoRelevanceText != null && e.SeoRelevanceText != "",
                e.SeoThemesJson != null && e.SeoThemesJson != "",
                e.SeoFaqsJson != null && e.SeoFaqsJson != "",
                e.CreatedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(candidates);
    }
}

public record AutoPublishSettingsDto(
    bool Enabled, int BooksPerDay, int HourUtc, bool RequireReview, string Language);

public record AutoPublishJobListDto(
    Guid Id, Guid EditionId, string EditionTitle, string Status,
    bool GeneratedEditionSeo, bool GeneratedAuthorSeo, bool Priority,
    string? Error, DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt);

public record AutoPublishJobDetailDto(
    Guid Id, Guid EditionId, string EditionTitle, string Status,
    bool GeneratedEditionSeo, bool GeneratedAuthorSeo, bool Priority,
    string? Error, string? LogOutput,
    DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt);

public record CandidateEditionDto(
    Guid Id, string Title, string? Language, int ChapterCount,
    bool HasDescription, bool HasRelevance, bool HasThemes, bool HasFaqs,
    DateTimeOffset CreatedAt);
