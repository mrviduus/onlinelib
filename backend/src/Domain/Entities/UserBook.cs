using Domain.Enums;

namespace Domain.Entities;

public class UserBook
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public required string Slug { get; set; }
    public required string Language { get; set; }
    public string? Author { get; set; }
    public string? Description { get; set; }
    public string? CoverPath { get; set; }
    public string? Genre { get; set; }
    public int? PublishedYear { get; set; }
    public int? TotalWordCount { get; set; }
    public string? TocJson { get; set; }
    public UserBookStatus Status { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // Reading progress
    public string? ProgressChapterSlug { get; set; }
    public string? ProgressLocator { get; set; }
    public double? ProgressPercent { get; set; }
    public DateTimeOffset? ProgressUpdatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    // Takedown (DMCA / admin action) — soft-blocks access while keeping record for audit
    public DateTimeOffset? TakedownAt { get; set; }
    public string? TakedownReason { get; set; }

    // "Send to TextStack" web clip (private only — never enters the public Work/Edition/SSG path).
    public string? SourceUrl { get; set; }   // original article URL
    public bool IsClip { get; set; }         // true => Read later shelf
    public bool IsRead { get; set; }         // manual or auto-set when progress completes
    public DateTimeOffset? ReadAt { get; set; }

    // Editable metadata (slice 11)
    // 'auto' = LLM/import-derived, 'manual' = user-edited (protect from auto-overwrite)
    public string SeoSource { get; set; } = "auto";
    // JSONB array of prior metadata snapshots (capped at 5 server-side)
    public string? MetadataHistoryJson { get; set; }

    // User-defined tags (slice 12) — Postgres text[] with GIN index, max 20 enforced server-side
    public string[] Tags { get; set; } = [];

    // AI-suggested tags pending user approval (slice 17). Cleared on accept or dismiss.
    public string[] SuggestedTags { get; set; } = [];
    public DateTimeOffset? SuggestedTagsAt { get; set; }

    public User User { get; set; } = null!;
    public ICollection<UserChapter> Chapters { get; set; } = [];
    public ICollection<UserBookFile> BookFiles { get; set; } = [];
    public ICollection<UserIngestionJob> IngestionJobs { get; set; } = [];
}
