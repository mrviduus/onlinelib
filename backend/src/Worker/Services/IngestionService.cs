using Infrastructure.Data;
using Infrastructure.Data.Entities;
using Infrastructure.Enums;
using Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Worker.Parsers;

namespace Worker.Services;

public class IngestionService
{
    private readonly IDbContextFactory<AppDbContext> _dbFactory;
    private readonly IFileStorageService _storage;
    private readonly EpubParser _epubParser;
    private readonly ILogger<IngestionService> _logger;

    public IngestionService(
        IDbContextFactory<AppDbContext> dbFactory,
        IFileStorageService storage,
        EpubParser epubParser,
        ILogger<IngestionService> logger)
    {
        _dbFactory = dbFactory;
        _storage = storage;
        _epubParser = epubParser;
        _logger = logger;
    }

    public async Task<IngestionJob?> GetNextJobAsync(CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);

        return await db.IngestionJobs
            .Where(j => j.Status == JobStatus.Queued)
            .OrderBy(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
    }

    public async Task ProcessJobAsync(Guid jobId, CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);

        var job = await db.IngestionJobs
            .Include(j => j.BookFile)
            .Include(j => j.Edition)
            .FirstOrDefaultAsync(j => j.Id == jobId, ct);

        if (job is null)
        {
            _logger.LogWarning("Job {JobId} not found", jobId);
            return;
        }

        _logger.LogInformation("Processing job {JobId} for edition {EditionId}", jobId, job.EditionId);

        try
        {
            // Mark as processing
            job.Status = JobStatus.Processing;
            job.StartedAt = DateTimeOffset.UtcNow;
            job.AttemptCount++;
            await db.SaveChangesAsync(ct);

            // Get file path
            var filePath = _storage.GetFullPath(job.BookFile.StoragePath);

            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException($"Book file not found: {filePath}");
            }

            // Parse based on format
            ParsedBook parsed;
            if (job.BookFile.Format == BookFormat.Epub)
            {
                parsed = await _epubParser.ParseAsync(filePath, ct);
            }
            else
            {
                throw new NotSupportedException($"Format {job.BookFile.Format} not yet supported");
            }

            _logger.LogInformation("Parsed {ChapterCount} chapters from {Title}",
                parsed.Chapters.Count, parsed.Title);

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
                var chapterSlug = GenerateChapterSlug(ch.Title, ch.Order);
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

            _logger.LogInformation("Job {JobId} completed successfully. {ChapterCount} chapters created.",
                jobId, parsed.Chapters.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job {JobId} failed", jobId);

            job.Status = JobStatus.Failed;
            job.FinishedAt = DateTimeOffset.UtcNow;
            job.Error = ex.Message;

            await db.SaveChangesAsync(CancellationToken.None);
        }
    }

    /// <summary>
    /// Generate SEO-friendly chapter slug from title.
    /// Examples: "Chapter 1" -> "chapter-1", "Letter 4" -> "letter-4",
    /// "CONTENTS" -> "contents", "Frankenstein;" -> "introduction"
    /// </summary>
    private static string GenerateChapterSlug(string title, int order)
    {
        var normalized = title.ToLowerInvariant()
            .Replace(" ", "-")
            .Replace("'", "")
            .Replace("\"", "")
            .Replace(":", "")
            .Replace(";", "")
            .Replace(".", "")
            .Replace(",", "");

        // Remove non-ascii and collapse multiple dashes
        var slug = new string(normalized.Where(c => char.IsLetterOrDigit(c) || c == '-').ToArray());
        while (slug.Contains("--"))
            slug = slug.Replace("--", "-");
        slug = slug.Trim('-');

        // If slug is empty or too short, use generic name
        if (string.IsNullOrEmpty(slug) || slug.Length < 2)
            slug = $"section-{order + 1}";

        return slug;
    }
}
