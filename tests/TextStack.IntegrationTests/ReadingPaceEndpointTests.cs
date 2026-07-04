using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

// R5 slice-3 wire-equivalence gate for GET /me/reading/pace (mirrors DailyStatsEndpointTests).
// Pace is not tz-dependent. Live data is non-deterministic, but the wpm invariant holds for every
// response: fallback (200) and any user-specific value are both clamped to >= 50. Skips when
// the stack is unavailable.
public class ReadingPaceEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public ReadingPaceEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    [Fact]
    public async Task GetPace_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/reading/pace");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetPace_NoParams_Returns200AndWpmInSaneRange()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/pace");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var pace = await response.Content.ReadFromJsonAsync<ReadingPace>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(pace);
        // Fallback is 200; user-specific values are clamped to [50, 800]. Either way >= 50.
        Assert.True(pace.Wpm >= 50);
        Assert.True(pace.Wpm <= 800);
        Assert.True(pace.SessionCount >= 0);
    }

    [Fact]
    public async Task GetPace_ResponseShape_HasCamelCaseFields()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/pace");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains("wpm", json);
        Assert.Contains("sessionCount", json);
        Assert.Contains("isUserSpecific", json);
    }

    // Local deserialization mirror of Contracts.ReadingTracking.ReadingPaceDto.
    private record ReadingPace(int Wpm, int SessionCount, bool IsUserSpecific);
}
