using OnlineLib.Search.Providers.PostgresFts;

namespace OnlineLib.Search.Configuration;

/// <summary>
/// PostgreSQL Full-Text Search provider configuration.
/// </summary>
public sealed class PostgresFtsOptions
{
    /// <summary>
    /// Configuration section name for binding.
    /// </summary>
    public const string SectionName = "Search:PostgresFts";

    /// <summary>
    /// PostgreSQL connection string.
    /// If not set, uses the default application connection string.
    /// </summary>
    public string? ConnectionString { get; set; }

    /// <summary>
    /// Table name for search documents.
    /// Default: uses existing chapters table.
    /// </summary>
    public string? TableName { get; set; }

    /// <summary>
    /// Highlight options for ts_headline.
    /// </summary>
    public HighlightOptions Highlights { get; set; } = HighlightOptions.Default;
}
