using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Npgsql;

namespace TextStack.IntegrationTests;

/// <summary>
/// GET /me/books/{id}/file — the range-capable original-PDF stream backing the
/// reader's "Original layout" view. PDF.js issues Range requests, so the endpoint
/// must serve 206 Partial Content for ranges and advertise Accept-Ranges: bytes on
/// a full request. Owner-scoped; 404 for non-owner / no-PDF-original.
///
/// The upload path stores the UserBookFile (Format=Pdf) synchronously, so /file is
/// serviceable immediately — no need to wait for the worker to finish extraction.
/// </summary>
public class UserBookOriginalFileEndpointTests
    : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public UserBookOriginalFileEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    // Minimal .pdf payload — the endpoint only streams bytes; validity is irrelevant.
    // Padded well past 1 KiB so a bytes=0-1023 range returns a full 1024-byte slice.
    private static byte[] SamplePdfBytes()
    {
        var header = Encoding.ASCII.GetBytes("%PDF-1.4\n% test original layout fixture\n");
        var body = new byte[4096];
        Array.Copy(header, body, header.Length);
        for (var i = header.Length; i < body.Length; i++)
            body[i] = (byte)('A' + (i % 26));
        return body;
    }

    // A tiny bytes payload named .epub → UploadAsync detects BookFormat.Epub, not Pdf.
    private static byte[] SampleEpubBytes()
    {
        // "PK" zip magic so it looks vaguely like an epub container; content is
        // irrelevant to the /file endpoint, which filters on Format==Pdf.
        var b = new byte[2048];
        b[0] = (byte)'P';
        b[1] = (byte)'K';
        return b;
    }

    private Task<Guid?> UploadPdfAsync() => UploadFileAsync(_auth.Client, _auth.CreateRequest,
        SamplePdfBytes(), "original-layout-test.pdf", "application/pdf");

    private Task<Guid?> UploadEpubAsync() => UploadFileAsync(_auth.Client, _auth.CreateRequest,
        SampleEpubBytes(), "original-layout-test.epub", "application/epub+zip");

    private async Task<Guid?> UploadFileAsync(
        HttpClient client,
        Func<HttpMethod, string, HttpRequestMessage> createRequest,
        byte[] bytes, string fileName, string contentType)
    {
        var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(fileContent, "file", fileName);
        content.Add(new StringContent("Original Layout Test"), "title");
        content.Add(new StringContent("en"), "language");

        var request = createRequest(HttpMethod.Post, "/me/books/upload");
        request.Content = content;
        var resp = await client.SendAsync(request, TestContext.Current.CancellationToken);
        if (resp.StatusCode != HttpStatusCode.OK) return null;

        var body = await resp.Content.ReadFromJsonAsync<UploadResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        return body?.UserBookId;
    }

    // Logs a distinct user in via test-login and returns its Cookie header value
    // (Secure cookies don't stick over HTTP, so we extract Set-Cookie manually —
    // same technique as AuthenticatedApiFixture). Null when test-login is disabled.
    private async Task<string?> LoginAsAsync(string email)
    {
        var login = new HttpRequestMessage(HttpMethod.Post, "/auth/test-login");
        login.Headers.Host = AuthenticatedApiFixture.TestHost;
        login.Content = JsonContent.Create(new { email });
        var resp = await _anon.Client.SendAsync(login, TestContext.Current.CancellationToken);
        if (!resp.IsSuccessStatusCode) return null;

        if (!resp.Headers.TryGetValues("Set-Cookie", out var cookies)) return null;
        var parts = cookies
            .Select(c => c.Split(';')[0].Trim())
            .Where(nv => !string.IsNullOrEmpty(nv));
        return string.Join("; ", parts);
    }

    private HttpRequestMessage CreateRequestWithCookie(HttpMethod method, string path, string cookie)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = AuthenticatedApiFixture.TestHost;
        request.Headers.Add("Cookie", cookie);
        return request;
    }

    [Fact]
    public async Task GetOriginalFile_WithoutAuth_Returns401()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, $"/me/books/{Guid.NewGuid()}/file");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginalFile_NonOwnerOrMissing_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        // A random id stands in for "a book the caller does not own": owner-scoped
        // query misses it → 404, never a leak of another user's file.
        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{Guid.NewGuid()}/file");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginalFile_ClipWithNoPdfOriginal_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        // A clip is an HTML UserBook with no PDF original → /file must 404.
        var seed = _auth.CreateRequest(HttpMethod.Post, "/me/books/clip");
        seed.Content = JsonContent.Create(new
        {
            title = "No-PDF Clip",
            html = "<h1>No PDF</h1><p>An article has no original PDF.</p>",
            language = "en"
        });
        var seedResp = await _auth.Client.SendAsync(seed, TestContext.Current.CancellationToken);
        Assert.SkipWhen(seedResp.StatusCode != HttpStatusCode.OK, "clip seed unavailable");
        var clip = await seedResp.Content.ReadFromJsonAsync<UploadResponse>(
            cancellationToken: TestContext.Current.CancellationToken);

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{clip!.UserBookId}/file");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginalFile_NoRange_Returns200WithAcceptRanges()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var bookId = await UploadPdfAsync();
        Assert.SkipWhen(bookId is null, "pdf upload unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("bytes", response.Headers.AcceptRanges);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(4096, response.Content.Headers.ContentLength);
    }

    [Fact]
    public async Task GetOriginalFile_WithRange_Returns206PartialContent()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var bookId = await UploadPdfAsync();
        Assert.SkipWhen(bookId is null, "pdf upload unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        request.Headers.Range = new RangeHeaderValue(0, 1023);
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);

        var contentRange = response.Content.Headers.ContentRange;
        Assert.NotNull(contentRange);
        Assert.Equal("bytes", contentRange!.Unit);
        Assert.Equal(0, contentRange.From);
        Assert.Equal(1023, contentRange.To);
        Assert.Equal(4096, contentRange.Length);

        // Slice is exactly the requested 1024 bytes.
        Assert.Equal(1024, response.Content.Headers.ContentLength);
        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        Assert.Equal(1024, bytes.Length);
    }

    [Fact]
    public async Task GetOriginalFile_OtherUsersBook_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        // User B owns a real PDF book; user A (the primary fixture) must NOT be able
        // to read it. Unlike the random-Guid case, the row genuinely exists — this
        // isolates the ownership filter from mere non-existence.
        var cookieB = await LoginAsAsync("integration-test-original-pdf-b@textstack.app");
        Assert.SkipWhen(cookieB is null, "second-user test-login unavailable");

        var uploadB = new MultipartFormDataContent();
        var pdf = new ByteArrayContent(SamplePdfBytes());
        pdf.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        uploadB.Add(pdf, "file", "b-book.pdf");
        uploadB.Add(new StringContent("B Book"), "title");
        uploadB.Add(new StringContent("en"), "language");
        var upReq = CreateRequestWithCookie(HttpMethod.Post, "/me/books/upload", cookieB!);
        upReq.Content = uploadB;
        var upResp = await _anon.Client.SendAsync(upReq, TestContext.Current.CancellationToken);
        Assert.SkipWhen(upResp.StatusCode != HttpStatusCode.OK, "pdf upload (user B) unavailable");
        var bBook = await upResp.Content.ReadFromJsonAsync<UploadResponse>(
            cancellationToken: TestContext.Current.CancellationToken);

        // Sanity: B can read its own file (proves the book/file really exist).
        var ownReq = CreateRequestWithCookie(HttpMethod.Get, $"/me/books/{bBook!.UserBookId}/file", cookieB!);
        var ownResp = await _anon.Client.SendAsync(ownReq, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, ownResp.StatusCode);

        // A requests B's book → owner filter must yield 404, not the file.
        var crossReq = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bBook.UserBookId}/file");
        var crossResp = await _auth.Client.SendAsync(crossReq, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, crossResp.StatusCode);
    }

    [Fact]
    public async Task GetOriginalFile_EpubFormatBook_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        // A book whose stored original is EPUB (Format != Pdf) has no "Original
        // layout" — the Format==Pdf filter must exclude it → 404.
        var bookId = await UploadEpubAsync();
        Assert.SkipWhen(bookId is null, "epub upload unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginalFile_IfNoneMatchMatchingEtag_Returns304()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");

        var bookId = await UploadPdfAsync();
        Assert.SkipWhen(bookId is null, "pdf upload unavailable");

        // First request → capture the strong ETag (sha256 of the stored file).
        var first = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        var firstResp = await _auth.Client.SendAsync(first, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, firstResp.StatusCode);
        var etag = firstResp.Headers.ETag;
        Assert.NotNull(etag);

        // Conditional revalidation with the same ETag → 304 Not Modified, no body.
        var second = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        second.Headers.IfNoneMatch.Add(etag!);
        var secondResp = await _auth.Client.SendAsync(second, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotModified, secondResp.StatusCode);
    }

    // TakedownAt has no public API to set, so this drives it directly against the DB
    // (host-reachable Postgres via TEST_DB_CONNECTION) and asserts the endpoint's
    // TakedownAt==null filter then hides the file.
    private static string? DbConn => Environment.GetEnvironmentVariable("TEST_DB_CONNECTION");

    [Fact]
    public async Task GetOriginalFile_TakenDownBook_Returns404()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");
        Assert.SkipWhen(DbConn is null, "TEST_DB_CONNECTION not set");
        var ct = TestContext.Current.CancellationToken;

        var bookId = await UploadPdfAsync();
        Assert.SkipWhen(bookId is null, "pdf upload unavailable");

        // Serviceable before takedown.
        var before = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        var beforeResp = await _auth.Client.SendAsync(before, ct);
        Assert.Equal(HttpStatusCode.OK, beforeResp.StatusCode);

        await using (var conn = new NpgsqlConnection(DbConn))
        {
            await conn.OpenAsync(ct);
            await using var cmd = new NpgsqlCommand(
                "UPDATE user_books SET takedown_at = now() WHERE id = @id", conn);
            cmd.Parameters.AddWithValue("id", bookId!.Value);
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            Assert.Equal(1, rows);
        }

        // TakedownAt != null → 404.
        var after = _auth.CreateRequest(HttpMethod.Get, $"/me/books/{bookId}/file");
        var afterResp = await _auth.Client.SendAsync(after, ct);
        Assert.Equal(HttpStatusCode.NotFound, afterResp.StatusCode);
    }

    private record UploadResponse(Guid UserBookId, Guid JobId, string Status);
}
