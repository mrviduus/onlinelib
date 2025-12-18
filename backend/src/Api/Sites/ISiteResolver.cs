namespace Api.Sites;

public interface ISiteResolver
{
    Task<SiteContext?> ResolveAsync(string host, CancellationToken ct = default);
    void InvalidateCache();
}
