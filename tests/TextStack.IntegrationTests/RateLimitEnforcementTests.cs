using System.Net;

namespace TextStack.IntegrationTests;

/// <summary>
/// Does <c>RequireRateLimiting("guest-session")</c> actually limit anything?
///
/// This PR adds a whole slice around that policy — <c>RateLimitSettings</c>,
/// <c>RateLimits__GuestSessionPermitLimit</c> in compose, <c>GUEST_SESSION_PERMIT_LIMIT</c> in CI,
/// <c>RateLimitSettingsTests</c>, and the "a knob, not a bypass" argument in three docblocks. All of
/// it rests on the limiter running. <c>RateLimitSettingsTests</c> cannot see whether it does: it
/// binds the options object and asserts on the number, never on a response.
///
/// The limiter does not run. <c>Program.cs</c> calls <c>app.UseRateLimiter()</c> at line ~100 and
/// <c>app.UseRouting()</c> at line ~238. <c>RequireRateLimiting</c> attaches
/// <c>EnableRateLimitingAttribute</c> to endpoint METADATA, and the rate-limiting middleware reads
/// it off <c>HttpContext.GetEndpoint()</c> — which is null until routing has run. Every per-endpoint
/// policy in <c>AddTextStackRateLimiting</c> is therefore inert, and no global limiter is
/// configured to take over.
///
/// Measured against the running stack: 56 consecutive anonymous <c>POST /auth/guest</c> from one IP
/// with <c>GuestSessionPermitLimit=50</c> → 56× 200, zero 429. Nine consecutive failed
/// <c>POST /admin/auth/login</c> (policy: 5/min) → nine 401s, zero 429. Fourteen failed
/// <c>POST /auth/login</c> (policy: 10/min) → fourteen 401s, zero 429.
///
/// Why it matters more after this PR than before it: <c>/auth/guest</c> used to be a web-only,
/// cookie-driven path. It is now the first request every mobile install makes, it needs no
/// credentials, and each call inserts a <c>User</c> row that the cleanup worker will keep for 30
/// days and that unlocks the whole <c>/me/*</c> write surface plus the daily enrichment allowance.
///
/// Fix is one line — move <c>UseRateLimiter</c> below <c>UseRouting</c> — but it is a pipeline
/// reorder with its own consequences (the site/language/guest-activity middleware would then run
/// before the limiter rejects), so this test names the defect rather than assuming the shape of the
/// fix.
/// </summary>
public class RateLimitEnforcementTests(LiveApiFixture fixture) : IClassFixture<LiveApiFixture>
{
    /// <summary>
    /// Comfortably above every configured value the guest policy takes: 3 in production, 50 in CI
    /// and in the local compose stack. Kept as an upper bound rather than read from config so the
    /// test asserts the SERVER's behaviour and not the test host's environment — the CI value lives
    /// in the compose <c>.env</c>, which the test process never sees.
    /// </summary>
    private const int Attempts = 60;

    [Fact]
    public async Task GuestSession_FarBeyondAnyConfiguredLimit_IsRateLimited()
    {
        var ct = TestContext.Current.CancellationToken;

        var statuses = new List<HttpStatusCode>(Attempts);
        for (var i = 0; i < Attempts; i++)
        {
            var req = fixture.CreateRequest(HttpMethod.Post, "/auth/guest");
            req.Headers.Add("X-Client", "mobile");
            var resp = await fixture.Client.SendAsync(req, ct);

            if (i == 0) Assert.SkipWhen(IntegrationSkip.Unavailable(resp), "/auth/guest unavailable");

            statuses.Add(resp.StatusCode);
            // A working limiter short-circuits here, so the happy path costs ~4 or ~51 rows, not 60.
            if (resp.StatusCode == HttpStatusCode.TooManyRequests) break;
        }

        Assert.True(
            statuses.Contains(HttpStatusCode.TooManyRequests),
            $"{statuses.Count} consecutive POST /auth/guest from one IP, none rejected "
            + $"(distinct statuses: {string.Join(", ", statuses.Distinct().Select(s => (int)s))}). "
            + "The guest-session limiter is not enforced: UseRateLimiter() runs before UseRouting() "
            + "in Program.cs, so RequireRateLimiting metadata is never visible to it. Anonymous "
            + "User-row creation is unbounded, and RateLimits:GuestSessionPermitLimit is a no-op.");
    }
}
