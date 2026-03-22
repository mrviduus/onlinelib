using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminCodeGenEndpoints
{
    public static void MapAdminCodeGenEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/codegen").WithTags("Code Generation");

        group.MapPost("/jobs", CreateJob);
        group.MapGet("/jobs", GetJobs);
        group.MapGet("/jobs/{id:guid}", GetJob);
        group.MapPost("/jobs/{id:guid}/start", StartJob);
        group.MapPost("/jobs/{id:guid}/cancel", CancelJob);
    }

    // Single-site: general site ID (seeded in migrations)
    private static readonly Guid GeneralSiteId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static async Task<IResult> CreateJob(
        [FromBody] CreateCodeGenJobRequest request,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Description))
            return Results.BadRequest(new { error = "Description is required" });

        var siteId = GeneralSiteId;
        var job = new CodeGenJob
        {
            Id = Guid.NewGuid(),
            SiteId = siteId,
            Description = request.Description.Trim(),
            MaxIterations = Math.Clamp(request.MaxIterations ?? 10, 1, 50),
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.CodeGenJobs.Add(job);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/admin/codegen/jobs/{job.Id}", new { id = job.Id });
    }

    private static async Task<IResult> GetJobs(
        IAppDbContext db,
        [FromQuery] int offset = 0,
        [FromQuery] int limit = 20,
        CancellationToken ct = default)
    {
        var query = db.CodeGenJobs.OrderByDescending(j => j.CreatedAt);
        var total = await query.CountAsync(ct);
        var items = await query.Skip(offset).Take(limit)
            .Select(j => new CodeGenJobListDto(
                j.Id, j.Description, j.Status.ToString(), j.MaxIterations, j.CompletedIterations,
                j.BranchName, j.PrUrl, j.Error, j.CreatedAt, j.StartedAt, j.FinishedAt
            ))
            .ToListAsync(ct);

        return Results.Ok(new { total, items });
    }

    private static async Task<IResult> GetJob(
        Guid id,
        IAppDbContext db,
        CancellationToken ct)
    {
        var job = await db.CodeGenJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();

        return Results.Ok(new CodeGenJobDetailDto(
            job.Id, job.Description, job.Status.ToString(), job.MaxIterations, job.CompletedIterations,
            job.BranchName, job.PrUrl, job.Error, job.LogOutput,
            job.CreatedAt, job.StartedAt, job.FinishedAt
        ));
    }

    private static async Task<IResult> StartJob(
        Guid id,
        IAppDbContext db,
        CancellationToken ct)
    {
        var job = await db.CodeGenJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();
        if (job.Status != CodeGenJobStatus.Queued)
            return Results.BadRequest(new { error = "Job is not in Queued status" });

        job.Status = CodeGenJobStatus.Running;
        job.StartedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok();
    }

    private static async Task<IResult> CancelJob(
        Guid id,
        IAppDbContext db,
        CancellationToken ct)
    {
        var job = await db.CodeGenJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job == null) return Results.NotFound();
        if (job.Status is CodeGenJobStatus.Completed or CodeGenJobStatus.Failed or CodeGenJobStatus.Cancelled)
            return Results.BadRequest(new { error = "Job already finished" });

        job.Status = CodeGenJobStatus.Cancelled;
        job.FinishedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok();
    }
}

public record CreateCodeGenJobRequest(string Description, int? MaxIterations);

public record CodeGenJobListDto(
    Guid Id, string Description, string Status,
    int MaxIterations, int CompletedIterations,
    string? BranchName, string? PrUrl, string? Error,
    DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt
);

public record CodeGenJobDetailDto(
    Guid Id, string Description, string Status,
    int MaxIterations, int CompletedIterations,
    string? BranchName, string? PrUrl, string? Error, string? LogOutput,
    DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt
);
