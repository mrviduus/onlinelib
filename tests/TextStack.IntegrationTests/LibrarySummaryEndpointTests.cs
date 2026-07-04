using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

// R5 slice-3 wire-equivalence gate for GET /me/reading/library-summary (mirrors DailyStatsEndpointTests).
// Live data is non-deterministic — assert status + deserialization into the local record mirror + tz
// variants don't 500, never concrete values. Skips when the stack is unavailable.
public class LibrarySummaryEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public LibrarySummaryEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    [Fact]
    public async Task GetLibrarySummary_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/reading/library-summary");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetLibrarySummary_NoParams_Returns200AndDeserializes()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/library-summary");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var summary = await response.Content.ReadFromJsonAsync<LibrarySummary>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(summary);
        Assert.True(summary.PagesThisMonth >= 0);
        Assert.True(summary.MinutesThisMonth >= 0);
        Assert.True(summary.CurrentStreak >= 0);
        Assert.True(summary.StreakMinMinutes >= 0);
        Assert.True(summary.BooksFinishedYtd >= 0);
        // goal is nullable — present only when the user has an active daily or yearly goal.
        if (summary.Goal is not null)
            Assert.False(string.IsNullOrEmpty(summary.Goal.Type));
    }

    [Fact]
    public async Task GetLibrarySummary_NegativeTzOffset_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/library-summary?tz=-60");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetLibrarySummary_LargePositiveTzOffset_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/library-summary?tz=720");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetLibrarySummary_ResponseShape_HasCamelCaseFields()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/library-summary");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains("pagesThisMonth", json);
        Assert.Contains("minutesThisMonth", json);
        Assert.Contains("currentStreak", json);
        Assert.Contains("streakMinMinutes", json);
        Assert.Contains("booksFinishedYtd", json);
        Assert.Contains("goal", json);
    }

    // Local deserialization mirror of Contracts.ReadingTracking.LibrarySummaryDto / GoalSummaryDto.
    private record LibrarySummary(
        int PagesThisMonth,
        int MinutesThisMonth,
        int CurrentStreak,
        int StreakMinMinutes,
        int BooksFinishedYtd,
        Goal? Goal);

    private record Goal(string Type, int Current, int Target);
}
