using System.Diagnostics;
using Application.Common.Interfaces;
using Domain.Entities;
using Infrastructure.Data;
using Infrastructure.Telemetry;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Registry;
using AppIngestion = Application.Ingestion;

namespace Worker.Services;

public class IngestionWorkerService
{
    private readonly IDbContextFactory<AppDbContext> _dbFactory;
    private readonly IFileStorageService _storage;
    private readonly IExtractorRegistry _extractorRegistry;
    private readonly ILogger<IngestionWorkerService> _logger;

    public IngestionWorkerService(
        IDbContextFactory<AppDbContext> dbFactory,
        IFileStorageService storage,
        IExtractorRegistry extractorRegistry,
        ILogger<IngestionWorkerService> logger)
    {
        _dbFactory = dbFactory;
        _storage = storage;
        _extractorRegistry = extractorRegistry;
        _logger = logger;
    }

    public async Task<IngestionJob?> GetNextJobAsync(CancellationToken ct)
    {
        using var activity = IngestionActivitySource.Source.StartActivity("ingestion.job.pick");

        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var service = new AppIngestion.IngestionService(db, _storage);
        var job = await service.GetNextJobAsync(ct);

        activity?.SetTag("job.found", job is not null);
        if (job is not null)
        {
            activity?.SetTag("ingestion.job_id", job.Id.ToString());
        }

        return job;
    }

    public async Task<(int PendingCount, double OldestJobAgeMs)> GetQueueStatsAsync(CancellationToken ct)
    {
        await using var db = await _dbFactory.CreateDbContextAsync(ct);

        var pendingJobs = await db.IngestionJobs
            .Where(j => j.Status == Domain.Enums.JobStatus.Queued)
            .Select(j => j.CreatedAt)
            .ToListAsync(ct);

        if (pendingJobs.Count == 0)
            return (0, 0);

        var oldestJob = pendingJobs.Min();
        var ageMs = (DateTimeOffset.UtcNow - oldestJob).TotalMilliseconds;

        return (pendingJobs.Count, ageMs);
    }

    public async Task ProcessJobAsync(Guid jobId, CancellationToken ct)
    {
        using var activity = IngestionActivitySource.Source.StartActivity("ingestion.job.process");
        activity?.SetTag("ingestion.job_id", jobId.ToString());

        var stopwatch = Stopwatch.StartNew();
        string? sourceFormat = null;
        string? textSource = null;
        string? failureReason = null;

        await using var db = await _dbFactory.CreateDbContextAsync(ct);
        var service = new AppIngestion.IngestionService(db, _storage);

        var job = await service.GetJobWithDetailsAsync(jobId, ct);

        if (job is null)
        {
            _logger.LogWarning("Job {JobId} not found", jobId);
            activity?.SetStatus(ActivityStatusCode.Error, "Job not found");
            return;
        }

        activity?.SetTag("edition_id", job.EditionId.ToString());
        _logger.LogInformation("Processing job {JobId} for edition {EditionId}", jobId, job.EditionId);

        ExtractionResult? extractionResult = null;

        try
        {
            await service.MarkJobProcessingAsync(job, ct);

            // Record job started metric
            IngestionMetrics.JobsStarted.Add(1, new KeyValuePair<string, object?>("format", "unknown"));

            // File open span
            string filePath;
            using (var fileOpenActivity = IngestionActivitySource.Source.StartActivity("ingestion.file.open"))
            {
                filePath = service.GetFilePath(job.BookFile.StoragePath);
                fileOpenActivity?.SetTag("file.exists", File.Exists(filePath));

                if (!File.Exists(filePath))
                {
                    throw new FileNotFoundException($"Book file not found: {filePath}");
                }
            }

            await using var fileStream = File.OpenRead(filePath);
            var request = new ExtractionRequest
            {
                Content = fileStream,
                FileName = job.BookFile.OriginalFileName,
                ContentLength = fileStream.Length
            };

            // Extraction span
            var extractionStopwatch = Stopwatch.StartNew();
            using (var extractActivity = IngestionActivitySource.Source.StartActivity("extraction.run"))
            {
                var extractor = _extractorRegistry.Resolve(request);
                extractionResult = await extractor.ExtractAsync(request, ct);

                sourceFormat = extractionResult.SourceFormat.ToString();
                textSource = extractionResult.Diagnostics.TextSource.ToString();

                extractActivity?.SetTag("source_format", sourceFormat);
                extractActivity?.SetTag("text_source", textSource);
                extractActivity?.SetTag("units_count", extractionResult.Units.Count);
                extractActivity?.SetTag("confidence", extractionResult.Diagnostics.Confidence);
            }
            extractionStopwatch.Stop();

            // Record extraction metrics
            IngestionMetrics.ExtractionDuration.Record(
                extractionStopwatch.Elapsed.TotalMilliseconds,
                new KeyValuePair<string, object?>("format", sourceFormat),
                new KeyValuePair<string, object?>("text_source", textSource));

            // Track OCR usage
            if (extractionResult.Diagnostics.TextSource == TextSource.Ocr)
            {
                IngestionMetrics.OcrUsed.Add(1, new KeyValuePair<string, object?>("format", sourceFormat));
            }

            if (extractionResult.Diagnostics.TextSource == TextSource.None)
            {
                var warning = extractionResult.Diagnostics.Warnings.FirstOrDefault()?.Message ?? "Unsupported format";
                failureReason = "no_text_layer";
                throw new NotSupportedException(warning);
            }

            var parsed = MapToApplicationModel(extractionResult);
            var summary = MapToExtractionSummary(extractionResult);

            _logger.LogInformation("Parsed {ChapterCount} chapters from {Title}",
                parsed.Chapters.Count, parsed.Title);

            // Persist result span
            using (var persistActivity = IngestionActivitySource.Source.StartActivity("persist.result"))
            {
                await service.ProcessParsedBookAsync(job, parsed, summary, ct);
                persistActivity?.SetTag("chapters_count", parsed.Chapters.Count);
            }

            _logger.LogInformation("Job {JobId} completed successfully. {ChapterCount} chapters created.",
                jobId, parsed.Chapters.Count);

            // Record success metric
            stopwatch.Stop();
            IngestionMetrics.JobsSucceeded.Add(1, new KeyValuePair<string, object?>("format", sourceFormat));
            IngestionMetrics.JobDuration.Record(
                stopwatch.Elapsed.TotalMilliseconds,
                new KeyValuePair<string, object?>("format", sourceFormat));

            activity?.SetStatus(ActivityStatusCode.Ok);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job {JobId} failed", jobId);

            // Determine failure reason
            failureReason ??= ex switch
            {
                FileNotFoundException => "file_not_found",
                NotSupportedException => "unsupported",
                _ => "parse_error"
            };

            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddEvent(new ActivityEvent("exception", tags: new ActivityTagsCollection
            {
                { "exception.type", ex.GetType().FullName },
                { "exception.message", ex.Message },
                { "exception.stacktrace", ex.StackTrace }
            }));

            // Record failure metric
            stopwatch.Stop();
            IngestionMetrics.JobsFailed.Add(1,
                new KeyValuePair<string, object?>("format", sourceFormat ?? "unknown"),
                new KeyValuePair<string, object?>("reason", failureReason));
            IngestionMetrics.JobDuration.Record(
                stopwatch.Elapsed.TotalMilliseconds,
                new KeyValuePair<string, object?>("format", sourceFormat ?? "unknown"));

            // Persist diagnostics even on failure
            var summary = extractionResult is not null
                ? MapToExtractionSummary(extractionResult)
                : null;

            await service.MarkJobFailedAsync(job, ex.Message, summary, CancellationToken.None);
        }
    }

    private static AppIngestion.ParsedBook MapToApplicationModel(ExtractionResult result)
    {
        var chapters = result.Units
            .Select(u => new AppIngestion.ParsedChapter(
                u.OrderIndex,
                u.Title ?? $"Chapter {u.OrderIndex + 1}",
                u.Html ?? string.Empty,
                u.PlainText,
                u.WordCount ?? 0))
            .ToList();

        return new AppIngestion.ParsedBook(
            result.Metadata.Title,
            result.Metadata.Authors,
            result.Metadata.Description,
            chapters);
    }

    private static AppIngestion.ExtractionSummary MapToExtractionSummary(ExtractionResult result)
    {
        var warnings = result.Diagnostics.Warnings
            .Select(w => new AppIngestion.ExtractionWarningDto((int)w.Code, w.Message))
            .ToList();

        return new AppIngestion.ExtractionSummary(
            result.SourceFormat.ToString(),
            result.Units.Count,
            result.Diagnostics.TextSource.ToString(),
            result.Diagnostics.Confidence,
            warnings
        );
    }
}
