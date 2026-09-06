using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// The tier's daily enrichment cap is the meter on paid LLM spend for account-less users, and a
/// word only counts against it when it ACTIVATES into SRS. Two doors lead to an activation:
/// <c>PromotePending</c> and <c>PromoteLookup</c>. Only the first one checked.
///
/// <c>SaveWord</c>'s LookupOnly branch returns before every cap in the method — correctly, a lookup
/// row fires no LLM call — so a guest can park rare taps in the lookup bucket indefinitely and then
/// "Add anyway" them one at a time, each one an activation with its enrichment attached, with only
/// the 5000-word ceiling in front. That is 100x the tier's 50/day through the one door nobody
/// watched, and it is the exact argument <c>PromotePending</c>'s own comment already makes about
/// the other bucket.
///
/// Why this test exists at all: QA declined to write it because exercising a 50-word cap needs 50
/// real saves. That is a statement about the CAP being unconfigurable, not about the defect being
/// untestable — so the cap is now a deployment knob
/// (<c>Entitlements__Tiers__Guest__DailyEnrichmentCap</c>, compose env
/// <c>GUEST_DAILY_ENRICHMENT_CAP</c>, CI sets 3) exactly like the guest rate limit, and this test
/// reads the configured value back off the API instead of hard-coding it. A knob, not a bypass: the
/// check runs on the same code path at 3 as at 50.
/// </summary>
public class GuestEnrichmentCapEnforcementTests(LiveApiFixture fixture) : IClassFixture<LiveApiFixture>
{
    /// <summary>
    /// How many real word-saves this test is willing to make. Above this it skips with an
    /// actionable message rather than hammering the stack — the point of the knob is that CI
    /// configures a cap under this bound.
    /// </summary>
    private const int MaxAffordableCap = 10;

    /// <summary>Absent from the wordfreq dataset, so the frequency filter fails open to
    /// SrsEligible: every save activates, which is what fills the cap.</summary>
    private const string SrsLang = "de";

    private static string UniqueWord(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..16];

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
        Assert.SkipWhen(resp.StatusCode == HttpStatusCode.TooManyRequests,
            $"{req.RequestUri} rate limited — raise the relevant RateLimits__* value in the compose env");
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
    }

    private Task<JsonElement> SaveWordAsync(string token, string word, string language, CancellationToken ct)
    {
        var req = Req(HttpMethod.Post, "/me/vocabulary/words", token);
        req.Content = JsonContent.Create(new { word, language, nativeLanguage = "en" });
        return SendOkAsync(req, ct);
    }

    [Fact]
    public async Task PromoteLookup_TierEnrichmentCapExhausted_IsRejectedLikePromotePending()
    {
        var ct = TestContext.Current.CancellationToken;

        var guest = await SendOkAsync(Req(HttpMethod.Post, "/auth/guest"), ct);
        var token = guest.GetProperty("accessToken").GetString()!;

        // Own cap at the validator maximum, so the number the API reports back IS the tier ceiling
        // (GetStatusAsync returns min(user, tier)) — the test never has to know the configured value.
        // The frequency filter has to be ON or nothing ever lands in the lookup bucket.
        var settings = Req(HttpMethod.Put, "/me/vocabulary/settings", token);
        settings.Content = JsonContent.Create(new
        {
            dailyNewCap = 100,
            weeklyReviewBudget = 70,
            frequencyFilterEnabled = true,
            clusteringEnabled = true,
            autoRetireEnabled = true,
        });
        await SendOkAsync(settings, ct);

        var cap = (await SendOkAsync(Req(HttpMethod.Get, "/me/vocabulary/pending", token), ct))
            .GetProperty("dailyCap").GetInt32();
        Assert.SkipWhen(
            cap > MaxAffordableCap,
            $"guest tier enrichment cap is {cap}; set GUEST_DAILY_ENRICHMENT_CAP<={MaxAffordableCap} "
            + "(compose → Entitlements__Tiers__Guest__DailyEnrichmentCap) so the cap is reachable in a test");

        // Park a rare word in the lookup bucket BEFORE the cap is spent — that ordering is the
        // attack: lookups are free and uncapped, so the reservoir is filled at leisure.
        // A guid-suffixed English word cannot be in the wordfreq dataset ⇒ LookupOnly.
        var parked = await SaveWordAsync(token, UniqueWord("zzoov"), "en", ct);
        Assert.SkipWhen(
            parked.GetProperty("outcome").GetString() != "lookup",
            "frequency dataset not seeded on this stack — the lookup bucket cannot be reached");
        var lookupId = parked.GetProperty("lookupId").GetString();

        // Spend the day's allowance through the front door.
        for (var i = 0; i < cap; i++)
        {
            var save = await SaveWordAsync(token, UniqueWord($"zzfill{i}"), SrsLang, ct);
            Assert.Equal("srs", save.GetProperty("outcome").GetString());
        }

        var after = await SendOkAsync(Req(HttpMethod.Get, "/me/vocabulary/pending", token), ct);
        Assert.Equal(0, after.GetProperty("dailyRemaining").GetInt32());

        var promote = await fixture.Client.SendAsync(
            Req(HttpMethod.Post, $"/me/vocabulary/lookups/{lookupId}/promote", token), ct);

        Assert.True(
            promote.StatusCode == HttpStatusCode.TooManyRequests,
            $"promoting a parked lookup with 0 of {cap} daily enrichments left returned "
            + $"{(int)promote.StatusCode}. PromoteLookup queues the same paid enrichment as a fresh "
            + "save, so it must respect the tier cap exactly as PromotePending does — otherwise the "
            + "lookup bucket is an uncapped route to the 5000-word ceiling.");
    }
}
