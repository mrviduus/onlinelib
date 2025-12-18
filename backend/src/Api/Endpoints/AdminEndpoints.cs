using Application.Admin;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin").WithTags("Admin");

        group.MapPost("/books/upload", UploadBook)
            .DisableAntiforgery()
            .WithName("UploadBook")
            .WithDescription("Upload a book file (EPUB, PDF, FB2)");

        group.MapGet("/ingestion/jobs", GetIngestionJobs)
            .WithName("GetIngestionJobs");

        group.MapGet("/ingestion/jobs/{id:guid}", GetIngestionJob)
            .WithName("GetIngestionJob");
    }

    private static async Task<IResult> UploadBook(
        IFormFile file,
        [FromForm] Guid siteId,
        [FromForm] string title,
        [FromForm] string language,
        [FromForm] string? authors,
        [FromForm] string? description,
        [FromForm] Guid? workId,
        [FromForm] Guid? sourceEditionId,
        AdminService adminService,
        CancellationToken ct)
    {
        var (valid, error) = await adminService.ValidateUploadAsync(siteId, file.FileName, file.Length, ct);
        if (!valid)
            return Results.BadRequest(new { error });

        var (workValid, workError, work) = await adminService.GetOrCreateWorkAsync(siteId, title, workId, ct);
        if (!workValid)
            return Results.BadRequest(new { error = workError });

        await using var stream = file.OpenReadStream();
        var request = new UploadBookRequest(
            siteId, title, language, authors, description, workId, sourceEditionId,
            file.FileName, file.Length, stream
        );

        var result = await adminService.UploadBookAsync(request, work!, ct);

        return Results.Created($"/admin/ingestion/jobs/{result.JobId}", new
        {
            workId = result.WorkId,
            editionId = result.EditionId,
            bookFileId = result.BookFileId,
            jobId = result.JobId,
            status = "Queued"
        });
    }

    private static async Task<IResult> GetIngestionJobs(
        AdminService adminService,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        var jobs = await adminService.GetIngestionJobsAsync(offset ?? 0, limit ?? 20, ct);
        return Results.Ok(jobs);
    }

    private static async Task<IResult> GetIngestionJob(
        Guid id,
        AdminService adminService,
        CancellationToken ct)
    {
        var job = await adminService.GetIngestionJobAsync(id, ct);
        return job is null ? Results.NotFound() : Results.Ok(job);
    }
}
