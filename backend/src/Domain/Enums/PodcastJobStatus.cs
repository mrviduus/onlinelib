namespace Domain.Enums;

/// <summary>Lifecycle of a <c>PodcastGenerationJob</c> (Phase 3 — Podcast MVP).</summary>
public enum PodcastJobStatus
{
    Queued,
    Running,
    Succeeded,
    Failed,
}
