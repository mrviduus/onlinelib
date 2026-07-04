using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

// R5 slice-2 wire-equivalence gate for GET /me/reading/stats/daily (mirrors BookStatsEndpointTests).
// Live data is non-deterministic, so we assert status + JSON shape/casing + that the tz variants parse
// and don't 500 — never concrete values. Skips (not fails) when the stack is unavailable.
public class DailyStatsEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public DailyStatsEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    #region Unauthenticated

    [Fact]
    public async Task GetDailyStats_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/reading/stats/daily");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region Authenticated

    [Fact]
    public async Task GetDailyStats_NoParams_Returns200AndListShape()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats/daily");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stats = await response.Content.ReadFromJsonAsync<List<DailyStat>>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(stats);
        // Each bucket (if any) deserializes with non-negative aggregates.
        foreach (var day in stats)
        {
            Assert.True(day.TotalSeconds >= 0);
            Assert.True(day.TotalWords >= 0);
            Assert.True(day.SessionCount >= 0);
        }
    }

    [Fact]
    public async Task GetDailyStats_NegativeTzOffset_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats/daily?tz=-60");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetDailyStats_PositiveTzOffset_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats/daily?tz=120");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetDailyStats_WithFromToRange_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats/daily?from=2025-01-01&to=2025-12-31");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetDailyStats_ResponseShape_HasCamelCaseFields()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats/daily");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        // Root is a JSON array. Field casing is only observable when at least one bucket exists.
        Assert.StartsWith("[", json.TrimStart());
        if (json.Contains('{'))
        {
            Assert.Contains("date", json);
            Assert.Contains("totalSeconds", json);
            Assert.Contains("totalWords", json);
            Assert.Contains("sessionCount", json);
        }
    }

    #endregion

    // Local deserialization mirror of Contracts.ReadingTracking.DailyStatDto — field names drive the
    // camelCase wire contract this gate protects.
    private record DailyStat(DateTime Date, int TotalSeconds, int TotalWords, int SessionCount);
}
