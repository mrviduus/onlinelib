using Api.Sites;

namespace OnlineLib.UnitTests;

public class HostSiteResolverTests
{
    private readonly HostSiteResolver _resolver = new();

    [Theory]
    [InlineData("programming.localhost", "programming")]
    [InlineData("general.localhost", "general")]
    [InlineData("unknown.localhost", "general")]
    public void ResolveFromHost_ReturnsCorrectSite(string host, string expected)
    {
        var result = _resolver.ResolveFromHost(host);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void Resolve_DevMode_QueryOverridesHost()
    {
        var result = _resolver.Resolve(
            host: "general.localhost",
            querySite: "programming",
            isDevelopment: true);

        Assert.Equal("programming", result);
    }
}
