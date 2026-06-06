using System.Text.Json;
using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Worker.Services;

/// <summary>
/// Phase 3 (AI-014): processes queued <see cref="PodcastGenerationJob"/>s end-to-end —
/// <see cref="IPodcastScriptBuilder"/> (LLM dialogue) → <see cref="IAudioAssembler"/>
/// (Edge TTS + ffmpeg) → <see cref="IFileStorageService"/> (mp3) → job status. Mirrors
/// IngestionWorker: a singleton BackgroundService that opens a DI scope per job so it can
/// use the scoped script builder + db context. One job at a time; stuck Running jobs are
/// re-picked after a timeout.
/// </summary>
public class PodcastWorker(IServiceScopeFactory scopeFactory, ILogger<PodcastWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan StuckTimeout = TimeSpan.FromMinutes(10);
    private static readonly JsonSerializerOptions ScriptJsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await TryProcessOneAsync(stoppingToken);
                if (!processed)
                    await Task.Delay(PollInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Podcast worker loop error");
                await Task.Delay(PollInterval, stoppingToken);
            }
        }
    }

    private async Task<bool> TryProcessOneAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<IAppDbContext>();

        var stuckBefore = DateTimeOffset.UtcNow - StuckTimeout;
        var job = await db.PodcastGenerationJobs
            .Where(j => j.Status == PodcastJobStatus.Queued
                || (j.Status == PodcastJobStatus.Running && j.StartedAt < stuckBefore))
            .OrderBy(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (job is null)
            return false;

        job.Status = PodcastJobStatus.Running;
        job.StartedAt = DateTimeOffset.UtcNow;
        job.Error = null;
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Podcast job {JobId} started (edition {EditionId}, {Lang})", job.Id, job.EditionId, job.Lang);

        try
        {
            var script = await sp.GetRequiredService<IPodcastScriptBuilder>().BuildAsync(job.EditionId, job.Lang, ct);
            if (script is null)
            {
                await FailAsync(db, job, "Script generation produced no usable dialogue", ct);
                return true;
            }
            job.ScriptJson = JsonSerializer.Serialize(script.Lines, ScriptJsonOptions);
            await db.SaveChangesAsync(ct);

            var audio = await sp.GetRequiredService<IAudioAssembler>().AssembleAsync(script, job.Lang, ct);
            if (audio is null)
            {
                await FailAsync(db, job, "Audio assembly failed", ct);
                return true;
            }

            using var ms = new MemoryStream(audio.Mp3);
            var path = await sp.GetRequiredService<IFileStorageService>()
                .SaveFileAsync(job.EditionId, $"podcast-{job.Lang}.mp3", ms, ct);

            job.AudioPath = path;
            job.DurationSeconds = audio.DurationSeconds;
            job.Status = PodcastJobStatus.Succeeded;
            job.FinishedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            logger.LogInformation("Podcast job {JobId} done: {Path} ({Duration}s)", job.Id, path, audio.DurationSeconds);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Podcast job {JobId} failed", job.Id);
            // Use None so the failure is recorded even if the host is stopping.
            await FailAsync(db, job, ex.Message, CancellationToken.None);
        }

        return true;
    }

    private static async Task FailAsync(IAppDbContext db, PodcastGenerationJob job, string error, CancellationToken ct)
    {
        job.Status = PodcastJobStatus.Failed;
        job.Error = error.Length > 2000 ? error[..2000] : error;
        job.FinishedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}
