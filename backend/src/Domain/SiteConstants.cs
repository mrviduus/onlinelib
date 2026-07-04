namespace Domain;

/// <summary>
/// Single-site constants (ADR-007). The platform runs as one canonical site;
/// this GUID is the one source of truth for its identity.
///
/// The same value is frozen into migration seed data — do NOT change it, and do
/// NOT copy the literal elsewhere. Reference <see cref="DefaultSiteId"/> instead.
/// </summary>
public static class SiteConstants
{
    /// <summary>Canonical site id for the single-site deployment.</summary>
    public static readonly Guid DefaultSiteId = Guid.Parse("11111111-1111-1111-1111-111111111111");
}
