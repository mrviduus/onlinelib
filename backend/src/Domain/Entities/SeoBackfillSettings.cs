namespace Domain.Entities;

/// <summary>
/// Singleton settings for the SEO backfill poller. Row identified by fixed <see cref="FixedId"/>.
/// </summary>
public class SeoBackfillSettings
{
    /// <summary>Well-known singleton row id.</summary>
    public static readonly Guid FixedId = new("44444444-4444-4444-4444-444444444444");

    public Guid Id { get; set; } = FixedId;

    public bool Enabled { get; set; }

    public int JobsPerRun { get; set; } = 5;

    public int IntervalSeconds { get; set; } = 60;

    /// <summary>Restrict to these language codes (empty = all).</summary>
    public string[] LanguageFilter { get; set; } = [];

    /// <summary>Restrict to these entity type names (empty = all).</summary>
    public string[] EntityTypeFilter { get; set; } = [];

    /// <summary>Minutes the debouncer waits before triggering SSG rebuild after successful applies.</summary>
    public int SsgRebuildBatchMinutes { get; set; } = 5;

    public DateTimeOffset UpdatedAt { get; set; }
}
