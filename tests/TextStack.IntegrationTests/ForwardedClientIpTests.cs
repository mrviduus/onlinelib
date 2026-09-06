using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Every per-IP rate-limit partition is keyed on <c>Connection.RemoteIpAddress</c>, which behind a
/// proxy is whatever <c>UseForwardedHeaders</c> decides it is. That made the ForwardedHeaders
/// configuration part of the limiter, and it was wrong in both directions.
///
/// nginx writes <c>X-Forwarded-For</c> with <c>$proxy_add_x_forwarded_for</c>, which APPENDS its own
/// peer — cloudflared, on the same host — so the RIGHTMOST entry is 127.0.0.1 on every request the
/// site has ever served. The default <c>ForwardLimit</c> of 1 takes exactly that entry. While the
/// limiter never ran this was invisible; the moment it ran, "3 guest sessions per 5 minutes per IP"
/// would have meant three per five minutes for the entire internet, and the same for translate,
/// dictionary and TTS. In the other direction, an empty <c>KnownProxies</c>/<c>KnownIPNetworks</c>
/// let any caller nominate its own address and step around the limit entirely.
///
/// This test pins the property that matters, at the only layer that can observe it from outside: two
/// different clients arriving through the SAME trusted proxy hop must not share a bucket.
///
/// It uses <c>admin-login</c> (5/min/IP) with deliberately wrong credentials — cheap, creates no
/// rows, and its partitions here are synthetic addresses, so it cannot starve the real guest suite
/// the way the guest-session bucket does.
/// </summary>
public class ForwardedClientIpTests(LiveApiFixture fixture) : IClassFixture<LiveApiFixture>
{
    /// <summary>Matches <c>admin-login</c>'s compiled-in permit limit.</summary>
    private const int AdminLoginPermitLimit = 5;

    /// <summary>Private, therefore trusted: stands in for the cloudflared/nginx hop that the real
    /// deployment appends to every request.</summary>
    private const string TrustedProxyHop = "10.0.0.9";

    private async Task<HttpStatusCode> FailedAdminLoginAsync(string clientIp, CancellationToken ct)
    {
        var req = fixture.CreateAdminRequest(HttpMethod.Post, "/admin/auth/login");
        req.Headers.TryAddWithoutValidation("X-Forwarded-For", $"{clientIp}, {TrustedProxyHop}");
        req.Content = JsonContent.Create(new { email = "nobody@textstack.invalid", password = "wrong" });
        var resp = await fixture.Client.SendAsync(req, ct);
        return resp.StatusCode;
    }

    [Fact]
    public async Task RateLimit_TwoClientsBehindTheSameProxyHop_DoNotShareABucket()
    {
        var ct = TestContext.Current.CancellationToken;

        // Unique per run: the limiter's partitions are process-wide and outlive a single test.
        var suffix = Random.Shared.Next(1, 250);
        var clientA = $"198.51.100.{suffix}";
        var clientB = $"203.0.113.{suffix}";

        var first = await FailedAdminLoginAsync(clientA, ct);
        Assert.SkipWhen(first == HttpStatusCode.NotFound, "/admin/auth/login unavailable");
        Assert.SkipWhen(first == HttpStatusCode.TooManyRequests,
            "admin-login bucket already exhausted for this synthetic client");

        // Exhaust client A's own bucket.
        var exhausted = false;
        for (var i = 1; i < AdminLoginPermitLimit + 3 && !exhausted; i++)
            exhausted = await FailedAdminLoginAsync(clientA, ct) == HttpStatusCode.TooManyRequests;

        Assert.True(exhausted,
            $"{AdminLoginPermitLimit + 2} failed admin logins from one client were never rejected — "
            + "the admin-login limiter is not enforced.");

        // The assertion. Client B differs from A only in the LEFT (real client) entry; the proxy hop
        // on the right is identical, exactly as it is for every request in production.
        var otherClient = await FailedAdminLoginAsync(clientB, ct);
        Assert.True(
            otherClient != HttpStatusCode.TooManyRequests,
            "a second client behind the same proxy hop was rate-limited by the first client's "
            + "traffic: UseForwardedHeaders is resolving RemoteIpAddress to the PROXY rather than to "
            + "the client, so every per-IP limit in the app is really one global bucket. In "
            + "production that proxy entry is the cloudflared hop nginx appends to every single "
            + "request.");
    }
}
