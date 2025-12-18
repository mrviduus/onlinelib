using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Domain.Utilities;
using Microsoft.EntityFrameworkCore;

namespace Application.Ingestion;

public record ParsedChapter(int Order, string Title, string Html, string PlainText, int WordCount);
public record ParsedBook(string? Title, string? Authors, string? Description, List<ParsedChapter> Chapters);

public class IngestionService(IAppDbContext db, IFileStorageService storage)
{
    public async Task<IngestionJob?> GetNextJobAsync(CancellationToken ct)
    {
        return await db.IngestionJobs
            .Where(j => j.Status == JobStatus.Queued)
            .OrderBy(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<IngestionJob?> GetJobWithDetailsAsync(Guid jobId, CancellationToken ct)
    {
        return await db.IngestionJobs
            .Include(j => j.BookFile)
            .Include(j => j.Edition)
            .FirstOrDefaultAsync(j => j.Id == jobId, ct);
    }

    public string GetFilePath(string storagePath) => storage.GetFullPath(storagePath);

    public async Task MarkJobProcessingAsync(IngestionJob job, CancellationToken ct)
    {
        job.Status = JobStatus.Processing;
        job.StartedAt = DateTimeOffset.UtcNow;
        job.AttemptCount++;
        await db.SaveChangesAsync(ct);
    }

    public async Task ProcessParsedBookAsync(IngestionJob job, ParsedBook parsed, CancellationToken ct)
    {
        // Update edition metadata if empty
        if (string.IsNullOrEmpty(job.Edition.Description) && !string.IsNullOrEmpty(parsed.Description))
            job.Edition.Description = parsed.Description;

        if (string.IsNullOrEmpty(job.Edition.AuthorsJson) && !string.IsNullOrEmpty(parsed.Authors))
            job.Edition.AuthorsJson = parsed.Authors;

        job.Edition.UpdatedAt = DateTimeOffset.UtcNow;

        // Delete existing chapters (re-ingestion)
        var existingChapters = await db.Chapters
            .Where(c => c.EditionId == job.EditionId)
            .ToListAsync(ct);
        db.Chapters.RemoveRange(existingChapters);

        // Create new chapters
        foreach (var ch in parsed.Chapters)
        {
            var chapterSlug = SlugGenerator.GenerateChapterSlug(ch.Title, ch.Order);
            var chapter = new Chapter
            {
                Id = Guid.NewGuid(),
                EditionId = job.EditionId,
                ChapterNumber = ch.Order,
                Slug = chapterSlug,
                Title = ch.Title,
                Html = ch.Html,
                PlainText = ch.PlainText,
                WordCount = ch.WordCount,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.Chapters.Add(chapter);
        }

        // Mark as succeeded
        job.Status = JobStatus.Succeeded;
        job.FinishedAt = DateTimeOffset.UtcNow;
        job.Error = null;

        await db.SaveChangesAsync(ct);
    }

    public async Task MarkJobFailedAsync(IngestionJob job, string error, CancellationToken ct)
    {
        job.Status = JobStatus.Failed;
        job.FinishedAt = DateTimeOffset.UtcNow;
        job.Error = error;
        await db.SaveChangesAsync(ct);
    }
}
