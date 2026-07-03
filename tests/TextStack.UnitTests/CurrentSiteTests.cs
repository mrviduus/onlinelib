using Domain;
using Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;

namespace TextStack.UnitTests;

/// <summary>
/// R1a single-site fail-fast guard. <see cref="CurrentSite"/> is the rollback-safety
/// gate for the R1b query filter: a silent <see cref="Guid.Empty"/> would make every
/// site-scoped query match zero rows, so construction MUST crash instead.
/// </summary>
public class CurrentSiteTests
{
    private static IConfiguration Config(params (string key, string? value)[] pairs)
        => new ConfigurationBuilder()
            .AddInMemoryCollection(pairs.Select(p => new KeyValuePair<string, string?>(p.key, p.value)))
            .Build();

    [Fact]
    public void Resolve_NoConfig_UsesDefaultSiteId()
    {
        var site = new CurrentSite(Config());
        Assert.Equal(SiteConstants.DefaultSiteId, site.Id);
    }

    [Fact]
    public void Resolve_BlankSiteId_UsesDefaultSiteId()
    {
        var site = new CurrentSite(Config(("Site:Id", "   ")));
        Assert.Equal(SiteConstants.DefaultSiteId, site.Id);
    }

    [Fact]
    public void Resolve_ValidOverride_UsesOverride()
    {
        var overrideId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var site = new CurrentSite(Config(("Site:Id", overrideId.ToString())));
        Assert.Equal(overrideId, site.Id);
    }

    [Fact]
    public void Resolve_GarbageSiteId_Throws()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => new CurrentSite(Config(("Site:Id", "not-a-guid"))));
        Assert.Contains("Site:Id", ex.Message);
    }

    [Fact]
    public void Resolve_EmptyGuidConfig_Throws()
    {
        Assert.Throws<InvalidOperationException>(
            () => new CurrentSite(Config(("Site:Id", Guid.Empty.ToString()))));
    }

    [Fact]
    public void Ctor_EmptyGuid_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => new CurrentSite(Guid.Empty));
    }

    [Fact]
    public void Ctor_ValidGuid_SetsId()
    {
        Assert.Equal(SiteConstants.DefaultSiteId, new CurrentSite(SiteConstants.DefaultSiteId).Id);
    }
}
