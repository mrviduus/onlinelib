using Application.Admin;
using Contracts.Admin;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin").WithTags("Admin");

        // Book upload
        group.MapPost("/books/upload", UploadBook)
            .DisableAntiforgery()
            .WithName("UploadBook")
            .WithDescription("Upload a book file (EPUB, PDF, FB2)");

        // Ingestion jobs
        group.MapGet("/ingestion/jobs", GetIngestionJobs)
            .WithName("GetIngestionJobs");

        group.MapGet("/ingestion/jobs/{id:guid}", GetIngestionJob)
            .WithName("GetIngestionJob");

        // Editions CRUD
        group.MapGet("/editions", GetEditions)
            .WithName("GetEditions");

        group.MapGet("/editions/{id:guid}", GetEdition)
            .WithName("GetEdition");

        group.MapPut("/editions/{id:guid}", UpdateEdition)
            .WithName("UpdateEdition");

        group.MapDelete("/editions/{id:guid}", DeleteEdition)
            .WithName("DeleteEdition");

        group.MapPost("/editions/{id:guid}/publish", PublishEdition)
            .WithName("PublishEdition");

        group.MapPost("/editions/{id:guid}/unpublish", UnpublishEdition)
            .WithName("UnpublishEdition");
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

    // Edition endpoints

    private static async Task<IResult> GetEditions(
        AdminService adminService,
        [FromQuery] Guid? siteId,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        [FromQuery] string? status,
        [FromQuery] string? search,
        CancellationToken ct)
    {
        EditionStatus? statusEnum = null;
        if (!string.IsNullOrEmpty(status) && Enum.TryParse<EditionStatus>(status, true, out var parsed))
            statusEnum = parsed;

        var result = await adminService.GetEditionsAsync(siteId, offset ?? 0, limit ?? 20, statusEnum, search, ct);
        return Results.Ok(result);
    }

    private static async Task<IResult> GetEdition(
        Guid id,
        AdminService adminService,
        CancellationToken ct)
    {
        var edition = await adminService.GetEditionDetailAsync(id, ct);
        return edition is null ? Results.NotFound() : Results.Ok(edition);
    }

    private static async Task<IResult> UpdateEdition(
        Guid id,
        UpdateEditionRequest request,
        AdminService adminService,
        CancellationToken ct)
    {
        var (success, error) = await adminService.UpdateEditionAsync(id, request, ct);
        return success ? Results.Ok() : Results.BadRequest(new { error });
    }

    private static async Task<IResult> DeleteEdition(
        Guid id,
        AdminService adminService,
        CancellationToken ct)
    {
        var (success, error) = await adminService.DeleteEditionAsync(id, ct);
        return success ? Results.Ok() : Results.BadRequest(new { error });
    }

    private static async Task<IResult> PublishEdition(
        Guid id,
        AdminService adminService,
        CancellationToken ct)
    {
        var (success, error) = await adminService.PublishEditionAsync(id, ct);
        return success ? Results.Ok() : Results.BadRequest(new { error });
    }

    private static async Task<IResult> UnpublishEdition(
        Guid id,
        AdminService adminService,
        CancellationToken ct)
    {
        var (success, error) = await adminService.UnpublishEditionAsync(id, ct);
        return success ? Results.Ok() : Results.BadRequest(new { error });
    }
}
