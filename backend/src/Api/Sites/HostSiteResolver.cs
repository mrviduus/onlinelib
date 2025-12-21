namespace Api.Sites;

/// <summary>
/// Resolves site code from HTTP host header (subdomain-based).
/// See: docs/05-features/feat-0004-site-resolver-host.md
/// </summary>
public class HostSiteResolver
{
    /// <summary>
    /// Resolves site code from host header only.
    /// </summary>
    public string ResolveFromHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host))
            return SiteKeys.General;

        var subdomain = ExtractSubdomain(host);
        return NormalizeSiteKey(subdomain) ?? SiteKeys.General;
    }

    /// <summary>
    /// Resolves site code with optional query string override (Dev/Test only).
    /// </summary>
    public string Resolve(string host, string? querySite, bool isDevelopment)
    {
        // Dev override: ?site=... takes precedence
        if (isDevelopment && !string.IsNullOrWhiteSpace(querySite))
        {
            var normalized = NormalizeSiteKey(querySite);
            if (normalized is not null)
                return normalized;
        }

        return ResolveFromHost(host);
    }

    /// <summary>
    /// Extracts subdomain from host (first segment before dot).
    /// Returns empty if no subdomain.
    /// </summary>
    private static string ExtractSubdomain(string host)
    {
        var dotIndex = host.IndexOf('.');
        return dotIndex > 0 ? host[..dotIndex].ToLowerInvariant() : string.Empty;
    }

    /// <summary>
    /// Normalizes site key. Returns null if invalid.
    /// </summary>
    private static string? NormalizeSiteKey(string key)
    {
        var lower = key.ToLowerInvariant();
        return SiteKeys.Valid.Contains(lower) ? lower : null;
    }
}
