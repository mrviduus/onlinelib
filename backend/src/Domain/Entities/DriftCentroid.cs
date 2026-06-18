namespace Domain.Entities;

/// <summary>
/// One day's embedding centroid for a single AI feature (table <c>drift_centroids</c>),
/// written by the Phase 12 RLOps DriftDetectionWorker (slice 5b). The worker samples the
/// feature's recent <c>llm_traces</c> user prompts, embeds them, mean-pools to a daily
/// <see cref="Centroid"/>, then measures cosine drift against the rolling baseline of prior
/// daily centroids and emails an admin alert after N consecutive breaches.
///
/// One row per (<see cref="Feature"/>, <see cref="Day"/>) — the unique index makes a same-day
/// re-run idempotent and doubles as the "is it due?" check (no row for today = due). Plain POCO;
/// EF mapping (incl. the pgvector <c>vector(1536)</c> column) lives in AppDbContext.Ai.cs.
/// </summary>
public class DriftCentroid
{
    public Guid Id { get; set; }

    /// <summary>The AI feature this centroid is for (matches <c>llm_traces.feature_tag</c>).</summary>
    public required string Feature { get; set; }

    /// <summary>The UTC day this centroid summarizes (one row per feature per day).</summary>
    public DateOnly Day { get; set; }

    /// <summary>
    /// Mean-pooled embedding of the day's sampled prompts (1536-d, OpenAI
    /// text-embedding-3-small). Modeled as <c>float[]</c> to keep Domain framework-free;
    /// mapped to pgvector <c>vector(1536)</c> in EF. Null on a <c>insufficient</c> row
    /// (too few samples to compute a centroid).
    /// </summary>
    public float[]? Centroid { get; set; }

    /// <summary>How many prompts were sampled for this centroid.</summary>
    public int SampleSize { get; set; }

    /// <summary>Cosine drift (1 − cosine similarity) of today's centroid vs the baseline.
    /// Null when no math ran (insufficient sample). 0 on the seed/baseline row.</summary>
    public double? DriftScore { get; set; }

    /// <summary>Running count of consecutive days the drift breached the threshold (resets to 0
    /// on a non-breaching day). Drives the consecutive-days-to-alert gate.</summary>
    public int ConsecutiveBreaches { get; set; }

    /// <summary>Alert state for this day: <c>baseline</c> (seed, no priors) | <c>ok</c> |
    /// <c>warning</c> (≥1 breach, not yet alerting) | <c>alerting</c> (≥N consecutive breaches) |
    /// <c>insufficient</c> (too few samples).</summary>
    public required string AlertState { get; set; }

    /// <summary>When an admin alert was sent for this row (only set when the row crossed into
    /// <c>alerting</c> and fired). Null otherwise.</summary>
    public DateTimeOffset? AlertedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
