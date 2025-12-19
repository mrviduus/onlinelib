namespace Api.Sites;

/// <summary>
/// Provides the resolved site key for the current request.
/// Single source of truth for host-based site resolution.
/// </summary>
public interface IHostSiteContext
{
    string SiteKey { get; }
}

/// <summary>
/// Scoped service holding the resolved site key.
/// </summary>
public class HostSiteContext : IHostSiteContext
{
    public string SiteKey { get; set; } = SiteKeys.General;
}
