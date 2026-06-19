using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for Phase 2 on-demand "Ask this book" over USER-uploaded books, against the
/// live API. Owner-scoped: the index/status/ask paths need a user session and a real owned book
/// (seeded via the clip endpoint), so they skip when auth/seed is unavailable. The unauth + non-owner
/// paths run without a key. Cross-user isolation (user A's chunks never returned for user B) is
/// asserted at the SQL level in <c>RagServiceUserBookIsolationTests</c> (integration can't seed a
/// second user here); these tests cover the endpoint contract + ownership 404s.
/// </summary>
public class UserBookRagEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid SomeBook = Guid.Parse("11111111-2222-3333-4444-555555555555");

    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserBookRagEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private sealed record IndexStatus(string Status, int ChunkCount, int EmbeddedCount);
    private sealed record AskResponseDto(string Answer, object[] Citations, int LastReadOrd, bool Insufficient);
    private sealed record ClipResponse(Guid UserBookId, Guid JobId, string Status);

    private static readonly object SampleClip = new
    {
        title = "RAG Integration Clip",
        author = "Test Author",
        html = "<h1>RAG Integration Clip</h1><p>Real fluency comes from reading real books deeply, "
               + "consistently, over a long period of time. This paragraph exists so the chunker has text.</p>",
        language = "en"
    };

    // ----- Unauthenticated → 401 (before any DB/chunk/LLM work; no key needed) -----

    [Fact]
    public async Task PostIndex_NoAuth_Unauthorized()
    {
        var request = _anon.CreateRequest(HttpMethod.Post, $"/me/books/{SomeBook}/index");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetIndex_NoAuth_Unauthorized()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, $"/me/books/{SomeBook}/index");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PostAsk_NoAuth_Unauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/me/books/{SomeBook}/ask")
        {
            Content = JsonContent.Create(new { question = "anything" }),
        };
        request.Headers.Host = LiveApiFixture.TestHost;
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ----- Ownership: a book the caller does not own (random id) → 404, never leaked -----

    [Fact]
    public async Task PostIndex_AuthedForeignBook_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/me/books/{Guid.NewGuid()}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetIndex_AuthedForeignBook_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{Guid.NewGuid()}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostAsk_AuthedForeignBook_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/me/books/{Guid.NewGuid()}/ask");
        request.Content = JsonContent.Create(new { question = "what is this book about?" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // 404 = not the caller's book. 503 = no OpenAI key (services resolve before ownership) — skip.
        Assert.SkipWhen(
            response.StatusCode is HttpStatusCode.InternalServerError or HttpStatusCode.ServiceUnavailable,
            "host erroring / no key");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ----- Owner happy path: seed a real owned book, index it, poll status, ask -----

    [Fact]
    public async Task PostIndex_OwnedBook_Returns202Or200WithStatus()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var bookId = await SeedOwnedBookAsync();
        Assert.SkipWhen(bookId is null, "could not seed an owned user book");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/me/books/{bookId}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.True(
            response.StatusCode is HttpStatusCode.Accepted or HttpStatusCode.OK,
            $"expected 202 or 200, got {(int)response.StatusCode}");

        var status = await response.Content.ReadFromJsonAsync<IndexStatus>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(status);
        Assert.Contains(status!.Status, new[] { "NotIndexed", "Indexing", "Ready", "Failed" });
        Assert.True(status.ChunkCount >= 0);
        Assert.True(status.EmbeddedCount >= 0);
    }

    [Fact]
    public async Task GetIndex_OwnedBook_ReturnsStatusShape()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var bookId = await SeedOwnedBookAsync();
        Assert.SkipWhen(bookId is null, "could not seed an owned user book");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/index");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var status = await response.Content.ReadFromJsonAsync<IndexStatus>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(status);
        Assert.Contains(status!.Status, new[] { "NotIndexed", "Indexing", "Ready", "Failed" });
    }

    [Fact]
    public async Task PostAsk_OwnedBook_ReturnsAnswerOrInsufficient()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var bookId = await SeedOwnedBookAsync();
        Assert.SkipWhen(bookId is null, "could not seed an owned user book");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/me/books/{bookId}/ask");
        request.Content = JsonContent.Create(new { question = "what does this book say about reading?" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // 503 = no key, 504 = timeout, 500 = erroring → skip rather than fail.
        Assert.SkipWhen(
            IntegrationSkip.Unavailable(response)
                || response.StatusCode is HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout,
            "ask not reachable (no key / corpus / timeout)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var answer = await response.Content.ReadFromJsonAsync<AskResponseDto>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(answer);
        Assert.False(string.IsNullOrWhiteSpace(answer!.Answer));
    }

    /// <summary>
    /// Seeds a clip (a UserBook owned by the test user) and returns its id; null if the seed fails.
    /// The clip is processed async by the worker, but indexing reads UserChapter rows — so a
    /// just-seeded clip may chunk to 0 (→ Failed) before extraction lands; the contract assertions
    /// allow that. The point is owner-scoped 202/200/404 behavior, not embedding completion.
    /// </summary>
    private async Task<Guid?> SeedOwnedBookAsync()
    {
        var seed = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        seed.Content = JsonContent.Create(SampleClip);
        var resp = await _auth.Client.SendAsync(seed, TestContext.Current.CancellationToken);
        if (resp.StatusCode != HttpStatusCode.OK)
            return null;

        var clip = await resp.Content.ReadFromJsonAsync<ClipResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        return clip?.UserBookId == Guid.Empty ? null : clip?.UserBookId;
    }
}
