using Application.Common.Interfaces;
using Domain;
using Microsoft.Extensions.Configuration;

namespace Infrastructure.Persistence;

/// <summary>
/// Process-wide <see cref="ICurrentSite"/>. Reads <c>Site:Id</c> from config,
/// defaulting to <see cref="SiteConstants.DefaultSiteId"/> when unset.
///
/// Fail-fast: an empty/zero GUID throws at construction. A silent
/// <see cref="Guid.Empty"/> would make future site-scoped query filters match
/// zero rows — a data-invisible outage we'd rather turn into a boot crash.
/// </summary>
public sealed class CurrentSite : ICurrentSite
{
    public Guid Id { get; }

    public CurrentSite(Guid id)
    {
        if (id == Guid.Empty)
            throw new InvalidOperationException(
                "Site:Id resolved to an empty GUID. Configure a valid Site:Id (or leave it unset to use the default).");
        Id = id;
    }

    public CurrentSite(IConfiguration config) : this(Resolve(config)) { }

    private static Guid Resolve(IConfiguration config)
    {
        var raw = config["Site:Id"];
        if (string.IsNullOrWhiteSpace(raw))
            return SiteConstants.DefaultSiteId;
        if (!Guid.TryParse(raw, out var id))
            throw new InvalidOperationException($"Site:Id is not a valid GUID: '{raw}'.");
        return id;
    }
}
