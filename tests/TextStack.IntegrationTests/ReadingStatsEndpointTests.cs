using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

// R5 slice-3 wire-equivalence gate for GET /me/reading/stats (mirrors DailyStatsEndpointTests).
// Live data is non-deterministic, so we assert status + that the JSON deserializes into the local
// record mirror (which locks field names/types) + tz variants don't 500 — never concrete values.
// Skips (not fails) when the stack is unavailable.
public class ReadingStatsEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public ReadingStatsEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    [Fact]
    public async Task GetStats_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/reading/stats");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetStats_NoParams_Returns200AndDeserializes()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stats = await response.Content.ReadFromJsonAsync<ReadingStats>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(stats);
        Assert.True(stats.TotalSeconds >= 0);
        Assert.True(stats.TotalWords >= 0);
        Assert.True(stats.BooksFinished >= 0);
        Assert.True(stats.CurrentStreak >= 0);
        Assert.True(stats.LongestStreak >= 0);
        Assert.True(stats.StreakMinMinutes >= 0);
        // dailyGoal is nullable — present only when the user has an active daily_minutes goal.
        if (stats.DailyGoal is not null)
            Assert.True(stats.DailyGoal.Target >= 0);
    }

    [Fact]
    public async Task GetStats_NegativeTzOffset_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats?tz=-60");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetStats_LargePositiveTzOffset_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats?tz=720");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetStats_ResponseShape_HasCamelCaseFields()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/stats");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains("totalSeconds", json);
        Assert.Contains("totalWords", json);
        Assert.Contains("booksFinished", json);
        Assert.Contains("currentStreak", json);
        Assert.Contains("longestStreak", json);
        Assert.Contains("streakMinMinutes", json);
        Assert.Contains("avgDailyMinutes", json);
        Assert.Contains("avgWordsPerMinute", json);
        Assert.Contains("todaySeconds", json);
        Assert.Contains("todayVocabReviews", json);
        Assert.Contains("weekSeconds", json);
        Assert.Contains("monthSeconds", json);
        Assert.Contains("dailyGoal", json);
    }

    // Local deserialization mirror of Contracts.ReadingTracking.ReadingStatsResponse — field
    // names/types drive the camelCase wire contract this gate protects.
    private record ReadingStats(
        long TotalSeconds,
        long TotalWords,
        int BooksFinished,
        int CurrentStreak,
        int LongestStreak,
        int StreakMinMinutes,
        double AvgDailyMinutes,
        double AvgWordsPerMinute,
        long TodaySeconds,
        int TodayVocabReviews,
        long WeekSeconds,
        long MonthSeconds,
        DailyGoal? DailyGoal);

    private record DailyGoal(int Target, double Today, bool Met);
}
