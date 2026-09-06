using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// The server used to answer 200 to a registration in which it had just decided to throw away a
/// guest's entire accumulated library.
///
/// <c>GetGuestUserId</c> returned <c>null</c> for two completely different situations — "no bearer
/// was sent" (an ordinary registration, nothing to carry) and "a bearer WAS sent and does not
/// validate" (a guest session exists and is about to be abandoned). The merge then simply didn't
/// run, and nothing anywhere said so: to the client, and to the person tapping "create account",
/// the two outcomes are byte-identical.
///
/// A client that refreshes an about-to-expire token before signing in narrows this, but cannot
/// close it: a badly skewed device clock outruns any pre-expiry window, a rotated or revoked
/// refresh token cannot be renewed at all, and a token read back corrupt from a damaged keychain
/// never validates. In each case the user sees success and loses everything.
///
/// The fix is deliberately NOT a 401 — someone carrying a stale token and no guest data must still
/// be able to register. Sign-in still succeeds; it just stops being silent. The response now carries
/// <c>guestMergeSkipped</c>, which is what these tests assert on: an observable consequence rather
/// than a log line.
/// </summary>
public class GuestMergeSkipReportingTests(LiveApiFixture fixture) : IClassFixture<LiveApiFixture>
{
    private const string AccountPassword = "correct-horse-battery";

    private HttpRequestMessage Req(HttpMethod method, string path, string? token = null)
    {
        var req = fixture.CreateRequest(method, path);
        req.Headers.Add("X-Client", "mobile");
        if (token != null) req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
        return req;
    }

    private async Task<JsonElement> SendOkAsync(HttpRequestMessage req, CancellationToken ct)
    {
        var resp = await fixture.Client.SendAsync(req, ct);
        Assert.SkipWhen(IntegrationSkip.Unavailable(resp), $"{req.RequestUri} unavailable");
        Assert.SkipWhen(resp.StatusCode == HttpStatusCode.TooManyRequests, "rate limited");
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }

    /// <summary>
    /// Rewrites a real guest token's <c>exp</c>/<c>iat</c> into the past, keeping the original
    /// header, claims and signature bytes. The result is what a device with a badly wrong clock or a
    /// stale keychain entry actually presents: structurally a JWT, carrying a real guest's id, and
    /// unusable. The server rejects it on lifetime AND signature — one code path, since
    /// <c>ValidateAccessToken</c> returns null for either.
    /// </summary>
    private static string ExpireToken(string token)
    {
        var parts = token.Split('.');
        Assert.Equal(3, parts.Length);

        var claims = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
            Base64UrlDecode(parts[1]))!;
        var past = DateTimeOffset.UtcNow.AddDays(-30).ToUnixTimeSeconds();
        claims["exp"] = JsonSerializer.SerializeToElement(past);
        claims["iat"] = JsonSerializer.SerializeToElement(past - 3600);

        var payload = Base64UrlEncode(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(claims)));
        return $"{parts[0]}.{payload}.{parts[2]}";
    }

    [Fact]
    public async Task Register_WithUnusableGuestBearer_SucceedsAndReportsTheDroppedSession()
    {
        var ct = TestContext.Current.CancellationToken;

        var guest = await SendOkAsync(Req(HttpMethod.Post, "/auth/guest"), ct);
        var deadToken = ExpireToken(guest.GetProperty("accessToken").GetString()!);

        var req = Req(HttpMethod.Post, "/auth/register", deadToken);
        req.Content = JsonContent.Create(new
        {
            email = $"skip-report-{Guid.NewGuid():N}@textstack.test",
            password = AccountPassword,
            name = "Stale Token",
        });
        var resp = await fixture.Client.SendAsync(req, ct);
        Assert.SkipWhen(IntegrationSkip.Unavailable(resp), "/auth/register unavailable");
        Assert.SkipWhen(resp.StatusCode == HttpStatusCode.TooManyRequests, "user-login rate limit hit");

        // Constraint one: a stale token in someone's pocket must never stop them registering.
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        // Constraint two: and it must not pretend there was no guest.
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
        Assert.True(
            body.TryGetProperty("guestMergeSkipped", out var skipped),
            "auth response has no `guestMergeSkipped` field: the server can still drop a guest "
            + "session without any client being able to tell.");
        Assert.Equal("invalid_token", skipped.GetString());
    }

    /// <summary>
    /// The other half, and the one that keeps the signal worth having. No bearer at all is an
    /// ordinary registration — flagging it would make the field noise, and a field that is always
    /// set says nothing.
    /// </summary>
    [Fact]
    public async Task Register_WithNoBearerAtAll_ReportsNothing()
    {
        var ct = TestContext.Current.CancellationToken;

        var req = Req(HttpMethod.Post, "/auth/register");
        req.Content = JsonContent.Create(new
        {
            email = $"skip-quiet-{Guid.NewGuid():N}@textstack.test",
            password = AccountPassword,
            name = "No Token",
        });
        var body = await SendOkAsync(req, ct);

        var skipped = body.TryGetProperty("guestMergeSkipped", out var el) ? el.GetString() : null;
        Assert.True(skipped is null, $"ordinary registration reported `{skipped}`");
    }

    /// <summary>
    /// A live guest token is the happy path: the guest is promoted in place and nothing is reported.
    /// Without this, "always report invalid_token" would pass the first test.
    /// </summary>
    [Fact]
    public async Task Register_WithLiveGuestBearer_ReportsNothingAndPromotesInPlace()
    {
        var ct = TestContext.Current.CancellationToken;

        var guest = await SendOkAsync(Req(HttpMethod.Post, "/auth/guest"), ct);
        var guestToken = guest.GetProperty("accessToken").GetString()!;
        var guestId = guest.GetProperty("user").GetProperty("id").GetString();

        var req = Req(HttpMethod.Post, "/auth/register", guestToken);
        req.Content = JsonContent.Create(new
        {
            email = $"skip-live-{Guid.NewGuid():N}@textstack.test",
            password = AccountPassword,
            name = "Live Token",
        });
        var body = await SendOkAsync(req, ct);

        var skipped = body.TryGetProperty("guestMergeSkipped", out var el) ? el.GetString() : null;
        Assert.True(skipped is null, $"a healthy guest merge reported `{skipped}`");
        Assert.Equal(guestId, body.GetProperty("user").GetProperty("id").GetString());
    }
}
