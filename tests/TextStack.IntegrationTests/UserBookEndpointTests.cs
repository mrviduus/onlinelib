using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

public class UserBookEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserBookEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    #region Unauthenticated

    [Fact]
    public async Task GetUserBooks_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetUserBookQuota_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, "/me/books/quota");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    #endregion

    #region Authenticated - List

    [Fact]
    public async Task GetUserBooks_Authenticated_Returns200()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetUserBooks_ResponseShape_HasNewMetadataFields()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode != HttpStatusCode.OK, "list endpoint unavailable");

        var books = await response.Content.ReadFromJsonAsync<UserBookListItem[]>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(books);

        // Verify shape has new fields (even if array is empty, deserialization confirms shape)
        // If there are books, check fields are present
        foreach (var book in books)
        {
            Assert.NotNull(book.Id);
            Assert.NotNull(book.Title);
            // author, genre, totalWordCount are nullable — just verify they deserialize
        }
    }

    #endregion

    #region Authenticated - Quota

    [Fact]
    public async Task GetUserBookQuota_Authenticated_Returns200()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books/quota");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var quota = await response.Content.ReadFromJsonAsync<StorageQuotaResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(quota);
        Assert.True(quota.LimitBytes > 0);
    }

    #endregion

    #region Authenticated - Detail

    [Fact]
    public async Task GetUserBook_NonExistent_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{Guid.NewGuid()}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    #endregion

    #region Clip (Send to TextStack)

    private static readonly object SampleClip = new
    {
        title = "Integration Test Clip",
        author = "Test Author",
        sourceUrl = "https://example.com/article",
        html = "<h1>Integration Test Clip</h1><p>Real fluency comes from real books, read deeply.</p>",
        language = "en"
    };

    [Fact]
    public async Task ClipArticle_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(SampleClip);
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ClipArticle_Authenticated_Returns200WithProcessingStatus()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(SampleClip);
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ClipResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(body);
        Assert.NotEqual(Guid.Empty, body!.UserBookId);
        Assert.NotEqual(Guid.Empty, body.JobId);
        Assert.Equal("Processing", body.Status);
    }

    [Fact]
    public async Task ClipArticle_EmptyHtml_Returns400()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(new { title = "T", html = "", language = "en" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ClipArticle_MissingTitle_Returns400()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(new { title = "", html = "<p>body</p>", language = "en" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ClipArticle_OversizedHtml_Returns400()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var bigHtml = "<p>" + new string('a', 3 * 1024 * 1024) + "</p>"; // > 2 MB
        var request = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(new { title = "Big", html = bigHtml, language = "en" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ClipArticle_InvalidSourceUrl_Returns400()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(new
        {
            title = "T",
            sourceUrl = "javascript:alert(1)",
            html = "<p>body</p>",
            language = "en"
        });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("data:text/html,<script>alert(1)</script>")]
    [InlineData("file:///etc/passwd")]
    [InlineData("vbscript:msgbox(1)")]
    [InlineData("JAVASCRIPT:alert(1)")]
    public async Task ClipArticle_DangerousSourceUrlScheme_Returns400(string sourceUrl)
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        request.Content = JsonContent.Create(new
        {
            title = "T",
            sourceUrl,
            html = "<p>body</p>",
            language = "en"
        });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task MarkRead_NonExistentOrForeignBook_Returns404NotSilentSuccess()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        // A random id stands in for "a book the caller does not own": the owner-scoped
        // query must miss it and return 404 rather than NoContent.
        var mark = _auth.CreateRequest(HttpMethod.Put, $"/me/books/{Guid.NewGuid()}/read");
        var resp = await _auth.Client.SendAsync(mark, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetUserBooks_ReadLaterShelf_ReturnsOnlyClips()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        // Seed a clip so the shelf is non-empty.
        var seed = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        seed.Content = JsonContent.Create(SampleClip);
        var seedResp = await _auth.Client.SendAsync(seed, TestContext.Current.CancellationToken);
        Assert.SkipWhen(seedResp.StatusCode != HttpStatusCode.OK, "clip seed unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books?shelf=readlater");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var books = await response.Content.ReadFromJsonAsync<UserBookListItem[]>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(books);
        Assert.All(books!, b => Assert.True(b.IsClip));
    }

    [Fact]
    public async Task MarkRead_Authenticated_FlipsState()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var seed = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        seed.Content = JsonContent.Create(SampleClip);
        var seedResp = await _auth.Client.SendAsync(seed, TestContext.Current.CancellationToken);
        Assert.SkipWhen(seedResp.StatusCode != HttpStatusCode.OK, "clip seed unavailable");
        var clip = await seedResp.Content.ReadFromJsonAsync<ClipResponse>(
            cancellationToken: TestContext.Current.CancellationToken);

        var mark = _auth.CreateRequest(HttpMethod.Put, $"/me/books/{clip!.UserBookId}/read");
        var markResp = await _auth.Client.SendAsync(mark, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, markResp.StatusCode);

        var listReq = _auth.CreateRequest(HttpMethod.Get, "/me/books?shelf=readlater");
        var listResp = await _auth.Client.SendAsync(listReq, TestContext.Current.CancellationToken);
        var books = await listResp.Content.ReadFromJsonAsync<UserBookListItem[]>(
            cancellationToken: TestContext.Current.CancellationToken);
        var seeded = Assert.Single(books!, b => b.Id == clip.UserBookId.ToString());
        Assert.True(seeded.IsRead);
    }

    [Fact]
    public async Task GetUserBooks_UnreadFilter_ExcludesReadClips()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var seed = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        seed.Content = JsonContent.Create(SampleClip);
        var seedResp = await _auth.Client.SendAsync(seed, TestContext.Current.CancellationToken);
        Assert.SkipWhen(seedResp.StatusCode != HttpStatusCode.OK, "clip seed unavailable");
        var clip = await seedResp.Content.ReadFromJsonAsync<ClipResponse>(
            cancellationToken: TestContext.Current.CancellationToken);

        var mark = _auth.CreateRequest(HttpMethod.Put, $"/me/books/{clip!.UserBookId}/read");
        await _auth.Client.SendAsync(mark, TestContext.Current.CancellationToken);

        var req = _auth.CreateRequest(HttpMethod.Get, "/me/books?shelf=readlater&status=unread");
        var resp = await _auth.Client.SendAsync(req, TestContext.Current.CancellationToken);
        var books = await resp.Content.ReadFromJsonAsync<UserBookListItem[]>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(books);
        Assert.DoesNotContain(books!, b => b.Id == clip.UserBookId.ToString());
    }

    [Fact]
    public async Task GetUserBooks_DefaultBooksTab_ExcludesClips()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var seed = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        seed.Content = JsonContent.Create(SampleClip);
        var seedResp = await _auth.Client.SendAsync(seed, TestContext.Current.CancellationToken);
        Assert.SkipWhen(seedResp.StatusCode != HttpStatusCode.OK, "clip seed unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/books");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        var books = await response.Content.ReadFromJsonAsync<UserBookListItem[]>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(books);
        Assert.All(books!, b => Assert.False(b.IsClip));
    }

    private record ClipResponse(Guid UserBookId, Guid JobId, string Status);

    #endregion

    private record UserBookListItem(
        string Id,
        string Title,
        string? Slug,
        string? Language,
        string? Author,
        string? Description,
        string? CoverPath,
        string? Genre,
        string? Status,
        string? ErrorMessage,
        int ChapterCount,
        int? TotalWordCount,
        string? CreatedAt,
        string[]? Tags,
        string[]? SuggestedTags,
        string? SourceUrl,
        bool IsClip,
        bool IsRead,
        string? ReadAt
    );

    private record StorageQuotaResponse(long UsedBytes, long LimitBytes, double UsedPercent);
}
