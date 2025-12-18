using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Worker.Parsers;
using AppIngestion = Application.Ingestion;

namespace Worker.Services;

public class IngestionWorkerService
{
    private readonly IDbContextFactory<AppDbContext> _dbFactory;
    private readonly IFileStorageService _storage;
    private readonly EpubParser _epubParser;
    private readonly ILogger<IngestionWorkerService> _logger;

    public IngestionWorkerService(
        IDbContextFactory<AppDbContext> dbFactory,
        IFileStorageService storage,
        EpubParser epubParser,
        ILogger<IngestionWorkerService> logger)
    {
        _dbFactory = dbFactory;
        _storage = storage;
        _epubParser = epubParser;
        _logger = logger;
    }

    public async Task<IngestionJob?> GetNextJobAsync(CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var service = new AppIngestion.IngestionService(db, _storage);
        return await service.GetNextJobAsync(ct);
    }

    public async Task ProcessJobAsync(Guid jobId, CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var service = new AppIngestion.IngestionService(db, _storage);

        var job = await service.GetJobWithDetailsAsync(jobId, ct);

        if (job is null)
        {
            _logger.LogWarning("Job {JobId} not found", jobId);
            return;
        }

        _logger.LogInformation("Processing job {JobId} for edition {EditionId}", jobId, job.EditionId);

        try
        {
            await service.MarkJobProcessingAsync(job, ct);

            var filePath = service.GetFilePath(job.BookFile.StoragePath);

            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException($"Book file not found: {filePath}");
            }

            AppIngestion.ParsedBook parsed;
            if (job.BookFile.Format == BookFormat.Epub)
            {
                var epubParsed = await _epubParser.ParseAsync(filePath, ct);
                parsed = new AppIngestion.ParsedBook(
                    epubParsed.Title,
                    epubParsed.Authors,
                    epubParsed.Description,
                    epubParsed.Chapters.Select(c => new AppIngestion.ParsedChapter(c.Order, c.Title, c.Html, c.PlainText, c.WordCount)).ToList()
                );
            }
            else
            {
                throw new NotSupportedException($"Format {job.BookFile.Format} not yet supported");
            }

            _logger.LogInformation("Parsed {ChapterCount} chapters from {Title}",
                parsed.Chapters.Count, parsed.Title);

            await service.ProcessParsedBookAsync(job, parsed, ct);

            _logger.LogInformation("Job {JobId} completed successfully. {ChapterCount} chapters created.",
                jobId, parsed.Chapters.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job {JobId} failed", jobId);
            await service.MarkJobFailedAsync(job, ex.Message, CancellationToken.None);
        }
    }
}
