namespace Api.Sites;

/// <summary>
/// Canonical site keys. Single source of truth for site identifiers.
/// </summary>
public static class SiteKeys
{
    public const string General = "general";
    public const string Programming = "programming";

    /// <summary>Temporary alias: fiction -> general (remove after rename complete)</summary>
    public const string FictionAlias = "fiction";

    public static readonly HashSet<string> Valid = [General, Programming];
}
