using System.Security.Cryptography;
using Domain.Utilities;
using Infrastructure.Data;
using Infrastructure.Data.Entities;
using Infrastructure.Enums;
using Infrastructure.Storage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminEndpoints
{
    private static readonly string[] AllowedExtensions = [".epub", ".pdf", ".fb2"];
    private const long MaxFileSize = 100 * 1024 * 1024; // 100MB

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
        AppDbContext db,
        IFileStorageService storage,
        CancellationToken ct)
    {
        // Validate site exists
        if (!await db.Sites.AnyAsync(s => s.Id == siteId, ct))
            return Results.BadRequest(new { error = "Invalid siteId" });
        // Validate file
        if (file.Length == 0)
            return Results.BadRequest(new { error = "File is empty" });

        if (file.Length > MaxFileSize)
            return Results.BadRequest(new { error = $"File too large. Max {MaxFileSize / 1024 / 1024}MB" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            return Results.BadRequest(new { error = $"Invalid file type. Allowed: {string.Join(", ", AllowedExtensions)}" });

        var format = ext switch
        {
            ".epub" => BookFormat.Epub,
            ".pdf" => BookFormat.Pdf,
            ".fb2" => BookFormat.Fb2,
            _ => BookFormat.Other
        };

        // Create or get Work
        Work work;
        if (workId.HasValue)
        {
            work = await db.Works.FindAsync([workId.Value], ct)
                ?? throw new InvalidOperationException("Work not found");
            // Ensure work belongs to same site
            if (work.SiteId != siteId)
                return Results.BadRequest(new { error = "Work belongs to different site" });
        }
        else
        {
            work = new Work
            {
                Id = Guid.NewGuid(),
                SiteId = siteId,
                Slug = SlugGenerator.GenerateSlug(title),
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Works.Add(work);
        }

        // Create Edition
        var editionSlug = await GenerateUniqueEditionSlugAsync(db, siteId, title, language, ct);
        var edition = new Edition
        {
            Id = Guid.NewGuid(),
            WorkId = work.Id,
            SiteId = siteId,
            Language = language,
            Slug = editionSlug,
            Title = title,
            Description = description,
            AuthorsJson = authors,
            Status = EditionStatus.Draft,
            SourceEditionId = sourceEditionId,
            IsPublicDomain = false,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Editions.Add(edition);

        // Save file
        await using var stream = file.OpenReadStream();
        var storagePath = await storage.SaveFileAsync(edition.Id, file.FileName, stream, ct);

        // Calculate hash
        stream.Position = 0;
        using var sha = SHA256.Create();
        var hashBytes = await sha.ComputeHashAsync(file.OpenReadStream(), ct);
        var hash = Convert.ToHexString(hashBytes).ToLowerInvariant();

        // Create BookFile
        var bookFile = new BookFile
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            OriginalFileName = file.FileName,
            StoragePath = storagePath,
            Format = format,
            Sha256 = hash,
            UploadedAt = DateTimeOffset.UtcNow
        };
        db.BookFiles.Add(bookFile);

        // Create IngestionJob
        var job = new IngestionJob
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            BookFileId = bookFile.Id,
            TargetLanguage = language,
            WorkId = workId,
            SourceEditionId = sourceEditionId,
            Status = JobStatus.Queued,
            AttemptCount = 0,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.IngestionJobs.Add(job);

        await db.SaveChangesAsync(ct);

        return Results.Created($"/admin/ingestion/jobs/{job.Id}", new
        {
            workId = work.Id,
            editionId = edition.Id,
            bookFileId = bookFile.Id,
            jobId = job.Id,
            status = "Queued"
        });
    }

    private static async Task<IResult> GetIngestionJobs(
        AppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        var query = db.IngestionJobs
            .OrderByDescending(j => j.CreatedAt)
            .Skip(offset ?? 0)
            .Take(limit ?? 20);

        var jobs = await query.Select(j => new
        {
            j.Id,
            j.EditionId,
            j.Status,
            j.AttemptCount,
            j.Error,
            j.CreatedAt,
            j.StartedAt,
            j.FinishedAt
        }).ToListAsync(ct);

        return Results.Ok(jobs);
    }

    private static async Task<IResult> GetIngestionJob(
        Guid id,
        AppDbContext db,
        CancellationToken ct)
    {
        var job = await db.IngestionJobs
            .Where(j => j.Id == id)
            .Select(j => new
            {
                j.Id,
                j.EditionId,
                j.BookFileId,
                j.TargetLanguage,
                j.Status,
                j.AttemptCount,
                j.Error,
                j.CreatedAt,
                j.StartedAt,
                j.FinishedAt,
                Edition = new { j.Edition.Title, j.Edition.Language, j.Edition.Slug }
            })
            .FirstOrDefaultAsync(ct);

        return job is null ? Results.NotFound() : Results.Ok(job);
    }

    private static async Task<string> GenerateUniqueEditionSlugAsync(
        AppDbContext db,
        Guid siteId,
        string title,
        string language,
        CancellationToken ct)
    {
        var baseSlug = SlugGenerator.GenerateSlug(title);

        // Check if slug exists within site+language, if so add numeric suffix
        var slug = baseSlug;
        var exists = await db.Editions.AnyAsync(e => e.SiteId == siteId && e.Language == language && e.Slug == slug, ct);

        if (exists)
        {
            slug = $"{baseSlug}-{language}";
            exists = await db.Editions.AnyAsync(e => e.SiteId == siteId && e.Language == language && e.Slug == slug, ct);
        }

        var counter = 2;
        while (exists)
        {
            slug = $"{baseSlug}-{language}-{counter}";
            exists = await db.Editions.AnyAsync(e => e.SiteId == siteId && e.Language == language && e.Slug == slug, ct);
            counter++;
        }

        return slug;
    }
}
