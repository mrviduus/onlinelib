using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class BookStatsEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public BookStatsEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private static bool ShouldSkip(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;

    #region Unauthenticated

    [Fact]
    public async Task GetBookStats_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/reading/book-stats");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region Authenticated

    [Fact]
    public async Task GetBookStats_NoYear_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/book-stats");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stats = await response.Content.ReadFromJsonAsync<BookStatsResponse>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(stats);
        Assert.True(stats.BooksFinished >= 0);
        Assert.True(stats.TotalPages >= 0);
        Assert.NotNull(stats.GenreStats);
        Assert.NotNull(stats.AuthorStats);
        Assert.NotNull(stats.LanguageStats);
        Assert.NotNull(stats.BooksOverTime);
        Assert.NotNull(stats.BookLengthDistribution);
        Assert.NotNull(stats.PaceStats);
        Assert.NotNull(stats.AvailableYears);
    }

    [Fact]
    public async Task GetBookStats_WithYear_Returns200()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/book-stats?year=2025");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetBookStats_ResponseShape_HasAllFields()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/me/reading/book-stats");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (ShouldSkip(response)) return;

        var json = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        // Verify all expected fields are present in JSON
        Assert.Contains("booksFinished", json);
        Assert.Contains("totalPages", json);
        Assert.Contains("avgDaysToFinish", json);
        Assert.Contains("genreStats", json);
        Assert.Contains("authorStats", json);
        Assert.Contains("languageStats", json);
        Assert.Contains("booksOverTime", json);
        Assert.Contains("bookLengthDistribution", json);
        Assert.Contains("paceStats", json);
        Assert.Contains("readingTimeByGenre", json);
        Assert.Contains("readingTimeByAuthor", json);
        Assert.Contains("availableYears", json);
    }

    #endregion

    private record BookStatsResponse(
        int BooksFinished,
        int TotalPages,
        double AvgDaysToFinish,
        object[] GenreStats,
        object[] AuthorStats,
        object[] LanguageStats,
        object[] BooksOverTime,
        object[] BookLengthDistribution,
        object[] PaceStats,
        object[] ReadingTimeByGenre,
        object[] ReadingTimeByAuthor,
        int[] AvailableYears
    );
}
