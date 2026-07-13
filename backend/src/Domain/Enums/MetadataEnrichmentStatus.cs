namespace Domain.Enums;

/// <summary>
/// Visible lifecycle of a user book's LLM metadata enrichment (AI-Agent-1). Distinct from
/// <see cref="UserBookStatus"/> (which tracks extraction): enrichment runs fire-and-forget AFTER the
/// book is Ready. <see cref="NotStarted"/> is the pre-feature backlog default (badge hidden — we don't
/// retro-enrich). A book moves Pending → Running (atomically claimed, timestamp stamped for stale
/// recovery) → Completed even when nothing was filled (kills "forever-enriching"), or → Failed on error.
/// </summary>
public enum MetadataEnrichmentStatus
{
    NotStarted = 0,
    Pending = 1,
    Running = 2,
    Completed = 3,
    Failed = 4
}
