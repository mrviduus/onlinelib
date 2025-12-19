using Api.Sites;

namespace OnlineLib.UnitTests;

/// <summary>
/// Tests for host-based site resolution rules.
/// See: docs/05-features/feat-0004-site-resolver-host.md
/// </summary>
public class HostSiteResolverTests
{
    private readonly HostSiteResolver _resolver = new();

    #region Host-based resolution (subdomain parsing)

    [Theory]
    [InlineData("programming.localhost", "programming")]
    [InlineData("programming.example.com", "programming")]
    [InlineData("programming.onlinelib.io", "programming")]
    public void ResolveFromHost_Programming_ReturnsProgramming(string host, string expected)
    {
        var result = _resolver.ResolveFromHost(host);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("general.localhost", "general")]
    [InlineData("general.example.com", "general")]
    [InlineData("general.onlinelib.io", "general")]
    public void ResolveFromHost_General_ReturnsGeneral(string host, string expected)
    {
        var result = _resolver.ResolveFromHost(host);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("fiction.localhost", "general")]
    [InlineData("fiction.example.com", "general")]
    [InlineData("fiction.onlinelib.io", "general")]
    public void ResolveFromHost_Fiction_ReturnsGeneralAlias(string host, string expected)
    {
        // fiction -> general (temporary alias until rename complete)
        var result = _resolver.ResolveFromHost(host);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("unknown.localhost", "general")]
    [InlineData("random.example.com", "general")]
    [InlineData("localhost", "general")]
    [InlineData("example.com", "general")]
    [InlineData("", "general")]
    public void ResolveFromHost_UnknownOrEmpty_ReturnsGeneralDefault(string host, string expected)
    {
        var result = _resolver.ResolveFromHost(host);
        Assert.Equal(expected, result);
    }

    #endregion

    #region Query string override (Dev/Test only)

    [Theory]
    [InlineData("programming", "programming")]
    [InlineData("general", "general")]
    [InlineData("fiction", "general")] // alias
    public void ResolveWithQueryOverride_ValidSite_ReturnsOverride(string querySite, string expected)
    {
        // In Dev/Test, ?site=... overrides host
        var result = _resolver.Resolve(
            host: "unknown.localhost",
            querySite: querySite,
            isDevelopment: true);

        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("invalid")]
    [InlineData("unknown")]
    [InlineData("")]
    [InlineData(null)]
    public void ResolveWithQueryOverride_InvalidSite_FallsBackToHost(string? querySite)
    {
        // Unknown query site falls back to host resolution
        var result = _resolver.Resolve(
            host: "programming.localhost",
            querySite: querySite,
            isDevelopment: true);

        Assert.Equal("programming", result);
    }

    [Fact]
    public void ResolveWithQueryOverride_ProductionMode_IgnoresQuerySite()
    {
        // In production, query override is ignored
        var result = _resolver.Resolve(
            host: "general.localhost",
            querySite: "programming",
            isDevelopment: false);

        Assert.Equal("general", result);
    }

    #endregion
}
