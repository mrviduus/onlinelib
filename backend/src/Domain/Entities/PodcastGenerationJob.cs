using Domain.Enums;

namespace Domain.Entities;

/// <summary>
/// A request to generate a 2-voice "podcast" (NotebookLM-style dialogue) for a catalog
/// edition (Phase 3). Processed by the Worker: LLM builds a script, Edge TTS voices each
/// line, ffmpeg stitches them into one mp3 stored under the edition. Mirrors the
/// <see cref="BookQualityJob"/> job pattern. EF mapping in AppDbContext.Podcasts.cs.
/// </summary>
public class PodcastGenerationJob
{
    public Guid Id { get; set; }
    public Guid EditionId { get; set; }
    public string Lang { get; set; } = "en";
    public PodcastJobStatus Status { get; set; } = PodcastJobStatus.Queued;

    /// <summary>Structured script: array of <c>{"speaker","line"}</c> turns (jsonb).</summary>
    public string? ScriptJson { get; set; }

    /// <summary>Storage-relative path to the generated mp3 (served under /storage).</summary>
    public string? AudioPath { get; set; }

    public int? DurationSeconds { get; set; }
    public decimal? CostUsd { get; set; }
    public string? Error { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }

    public Edition? Edition { get; set; }
}
