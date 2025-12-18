using System.Security.Cryptography;
using Application.Common.Interfaces;
using Contracts.Admin;
using Contracts.Common;
using Domain.Entities;
using Domain.Enums;
using Domain.Utilities;
using Microsoft.EntityFrameworkCore;

namespace Application.Admin;

public record UploadBookRequest(
    Guid SiteId,
    string Title,
    string Language,
    string? Authors,
    string? Description,
    Guid? WorkId,
    Guid? SourceEditionId,
    string FileName,
    long FileSize,
    Stream FileStream
);

public record UploadBookResult(Guid WorkId, Guid EditionId, Guid BookFileId, Guid JobId);

public record IngestionJobDto(
    Guid Id,
    Guid EditionId,
    string EditionTitle,
    string Status,
    string? ErrorMessage,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt
);

public record IngestionJobDetailDto(
    Guid Id,
    Guid EditionId,
    Guid BookFileId,
    string TargetLanguage,
    JobStatus Status,
    int AttemptCount,
    string? Error,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    IngestionEditionDto Edition
);

public record IngestionEditionDto(string Title, string Language, string Slug);

public class AdminService(IAppDbContext db, IFileStorageService storage)
{
    private static readonly string[] AllowedExtensions = [".epub", ".pdf", ".fb2"];
    private const long MaxFileSize = 100 * 1024 * 1024;

    public async Task<(bool Valid, string? Error)> ValidateUploadAsync(
        Guid siteId, string fileName, long fileSize, CancellationToken ct)
    {
        if (!await db.Sites.AnyAsync(s => s.Id == siteId, ct))
            return (false, "Invalid siteId");

        if (fileSize == 0)
            return (false, "File is empty");

        if (fileSize > MaxFileSize)
            return (false, $"File too large. Max {MaxFileSize / 1024 / 1024}MB");

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            return (false, $"Invalid file type. Allowed: {string.Join(", ", AllowedExtensions)}");

        return (true, null);
    }

    public async Task<(bool Valid, string? Error, Work? Work)> GetOrCreateWorkAsync(
        Guid siteId, string title, Guid? workId, CancellationToken ct)
    {
        if (workId.HasValue)
        {
            var work = await db.Works.FindAsync([workId.Value], ct);
            if (work is null)
                return (false, "Work not found", null);
            if (work.SiteId != siteId)
                return (false, "Work belongs to different site", null);
            return (true, null, work);
        }

        var newWork = new Work
        {
            Id = Guid.NewGuid(),
            SiteId = siteId,
            Slug = SlugGenerator.GenerateSlug(title),
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Works.Add(newWork);
        return (true, null, newWork);
    }

    public async Task<UploadBookResult> UploadBookAsync(UploadBookRequest req, Work work, CancellationToken ct)
    {
        var ext = Path.GetExtension(req.FileName).ToLowerInvariant();
        var format = ext switch
        {
            ".epub" => BookFormat.Epub,
            ".pdf" => BookFormat.Pdf,
            ".fb2" => BookFormat.Fb2,
            _ => BookFormat.Other
        };

        var editionSlug = await GenerateUniqueEditionSlugAsync(req.SiteId, req.Title, req.Language, ct);
        var edition = new Edition
        {
            Id = Guid.NewGuid(),
            WorkId = work.Id,
            SiteId = req.SiteId,
            Language = req.Language,
            Slug = editionSlug,
            Title = req.Title,
            Description = req.Description,
            AuthorsJson = req.Authors,
            Status = EditionStatus.Draft,
            SourceEditionId = req.SourceEditionId,
            IsPublicDomain = false,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Editions.Add(edition);

        var storagePath = await storage.SaveFileAsync(edition.Id, req.FileName, req.FileStream, ct);

        req.FileStream.Position = 0;
        using var sha = SHA256.Create();
        var hashBytes = await sha.ComputeHashAsync(req.FileStream, ct);
        var hash = Convert.ToHexString(hashBytes).ToLowerInvariant();

        var bookFile = new BookFile
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            OriginalFileName = req.FileName,
            StoragePath = storagePath,
            Format = format,
            Sha256 = hash,
            UploadedAt = DateTimeOffset.UtcNow
        };
        db.BookFiles.Add(bookFile);

        var job = new IngestionJob
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            BookFileId = bookFile.Id,
            TargetLanguage = req.Language,
            WorkId = req.WorkId,
            SourceEditionId = req.SourceEditionId,
            Status = JobStatus.Queued,
            AttemptCount = 0,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.IngestionJobs.Add(job);

        await db.SaveChangesAsync(ct);

        return new UploadBookResult(work.Id, edition.Id, bookFile.Id, job.Id);
    }

    public async Task<List<IngestionJobDto>> GetIngestionJobsAsync(int offset, int limit, CancellationToken ct)
    {
        return await db.IngestionJobs
            .Include(j => j.Edition)
            .OrderByDescending(j => j.CreatedAt)
            .Skip(offset)
            .Take(limit)
            .Select(j => new IngestionJobDto(
                j.Id,
                j.EditionId,
                j.Edition.Title,
                j.Status.ToString(),
                j.Error,
                j.CreatedAt,
                j.StartedAt,
                j.FinishedAt
            ))
            .ToListAsync(ct);
    }

    public async Task<IngestionJobDetailDto?> GetIngestionJobAsync(Guid id, CancellationToken ct)
    {
        return await db.IngestionJobs
            .Where(j => j.Id == id)
            .Select(j => new IngestionJobDetailDto(
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
                new IngestionEditionDto(j.Edition.Title, j.Edition.Language, j.Edition.Slug)
            ))
            .FirstOrDefaultAsync(ct);
    }

    private async Task<string> GenerateUniqueEditionSlugAsync(
        Guid siteId, string title, string language, CancellationToken ct)
    {
        var baseSlug = SlugGenerator.GenerateSlug(title);
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

    // Edition CRUD

    public async Task<PaginatedResult<AdminEditionListDto>> GetEditionsAsync(
        Guid? siteId, int offset, int limit, EditionStatus? status, string? search, CancellationToken ct)
    {
        var query = db.Editions.AsQueryable();

        if (siteId.HasValue)
            query = query.Where(e => e.SiteId == siteId.Value);

        if (status.HasValue)
            query = query.Where(e => e.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(e => e.Title.Contains(search) || (e.AuthorsJson != null && e.AuthorsJson.Contains(search)));

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(e => e.CreatedAt)
            .Skip(offset)
            .Take(limit)
            .Select(e => new AdminEditionListDto(
                e.Id,
                e.Slug,
                e.Title,
                e.AuthorsJson,
                e.Status.ToString(),
                e.Chapters.Count,
                e.CreatedAt,
                e.PublishedAt
            ))
            .ToListAsync(ct);

        return new PaginatedResult<AdminEditionListDto>(total, items);
    }

    public async Task<AdminEditionDetailDto?> GetEditionDetailAsync(Guid id, CancellationToken ct)
    {
        return await db.Editions
            .Where(e => e.Id == id)
            .Select(e => new AdminEditionDetailDto(
                e.Id,
                e.WorkId,
                e.SiteId,
                e.Slug,
                e.Title,
                e.Language,
                e.AuthorsJson,
                e.Description,
                e.CoverPath,
                e.Status.ToString(),
                e.IsPublicDomain,
                e.CreatedAt,
                e.PublishedAt,
                e.Chapters
                    .OrderBy(c => c.ChapterNumber)
                    .Select(c => new AdminChapterDto(c.Id, c.ChapterNumber, c.Slug, c.Title, c.WordCount))
                    .ToList()
            ))
            .FirstOrDefaultAsync(ct);
    }

    public async Task<(bool Success, string? Error)> UpdateEditionAsync(
        Guid id, UpdateEditionRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            return (false, "Title is required");

        if (request.Title.Length > 500)
            return (false, "Title must be 500 characters or less");

        if (request.Description?.Length > 5000)
            return (false, "Description must be 5000 characters or less");

        var edition = await db.Editions.FindAsync([id], ct);
        if (edition is null)
            return (false, "Edition not found");

        edition.Title = request.Title;
        edition.AuthorsJson = request.AuthorsJson;
        edition.Description = request.Description;
        edition.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> DeleteEditionAsync(Guid id, CancellationToken ct)
    {
        var edition = await db.Editions
            .Include(e => e.Chapters)
            .Include(e => e.BookFiles)
            .FirstOrDefaultAsync(e => e.Id == id, ct);

        if (edition is null)
            return (false, "Edition not found");

        if (edition.Status == EditionStatus.Published)
            return (false, "Cannot delete published edition. Unpublish first.");

        // Delete related entities
        db.Chapters.RemoveRange(edition.Chapters);
        db.BookFiles.RemoveRange(edition.BookFiles);

        // Delete ingestion jobs
        var jobs = await db.IngestionJobs.Where(j => j.EditionId == id).ToListAsync(ct);
        db.IngestionJobs.RemoveRange(jobs);

        db.Editions.Remove(edition);

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> PublishEditionAsync(Guid id, CancellationToken ct)
    {
        var edition = await db.Editions
            .Include(e => e.Chapters)
            .FirstOrDefaultAsync(e => e.Id == id, ct);

        if (edition is null)
            return (false, "Edition not found");

        if (edition.Status == EditionStatus.Published)
            return (false, "Edition is already published");

        if (edition.Chapters.Count == 0)
            return (false, "Cannot publish edition with no chapters");

        edition.Status = EditionStatus.Published;
        edition.PublishedAt = DateTimeOffset.UtcNow;
        edition.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> UnpublishEditionAsync(Guid id, CancellationToken ct)
    {
        var edition = await db.Editions.FindAsync([id], ct);

        if (edition is null)
            return (false, "Edition not found");

        if (edition.Status != EditionStatus.Published)
            return (false, "Edition is not published");

        edition.Status = EditionStatus.Draft;
        edition.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return (true, null);
    }
}
