using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// GDPR / Google-Play hard-delete contract for <c>DELETE /me/account</c>.
///
/// Each test provisions its OWN throwaway user (unique test-login email) so the
/// destructive delete never touches the shared <see cref="AuthenticatedApiFixture"/>
/// user. The throwaway user authenticates with a Bearer access token (returned in
/// the body when the request advertises <c>X-Client: mobile</c>), populates
/// representative dependent rows (vocabulary word, catalog highlight, user book via
/// clip, reading session), then deletes the account and verifies everything is gone.
///
/// Requires: docker compose up with ENABLE_TEST_AUTH=true.
/// </summary>
public class AccountDeletionEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;
    private const string TestHost = "localhost";

    public AccountDeletionEndpointTests(LiveApiFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task DeleteAccount_WithoutAuth_Returns401()
    {
        var req = _fixture.CreateRequest(HttpMethod.Delete, "/me/account");
        var resp = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task DeleteAccount_RemovesUserAndAllData_TokenNoLongerWorks()
    {
        var ct = TestContext.Current.CancellationToken;

        // 1. Provision an isolated throwaway user → Bearer token.
        var token = await CreateThrowawayUserAsync(ct);
        Assert.SkipWhen(token is null, "test auth unavailable");

        // 2. Discover a catalog edition + chapter (for the highlight).
        var (editionId, chapterId) = await DiscoverEditionChapterAsync(ct);
        Assert.SkipWhen(editionId is null, "no catalog book available");

        // 3. Populate representative dependent rows.

        // Vocabulary word — no edition FK required.
        var vocabResp = await SendAsync(HttpMethod.Post, "/me/vocabulary/words", token!,
            new { word = $"w{Guid.NewGuid():N}"[..12], language = "de", nativeLanguage = "en" }, ct);
        Assert.SkipWhen(IntegrationSkip.Unavailable(vocabResp), "vocabulary endpoint unavailable");
        Assert.True(vocabResp.IsSuccessStatusCode, $"save word failed: {vocabResp.StatusCode}");

        // Catalog highlight.
        var highlightResp = await SendAsync(HttpMethod.Post, "/me/highlights", token!, new
        {
            editionId,
            chapterId,
            anchorJson = """{"prefix":"a","exact":"b","suffix":"c","startOffset":0,"endOffset":1,"chapterId":"x"}""",
            color = "yellow",
            selectedText = "b"
        }, ct);
        Assert.True(highlightResp.IsSuccessStatusCode, $"create highlight failed: {highlightResp.StatusCode}");

        // User book via clip (synchronous row creation, no file upload needed).
        var clipResp = await SendAsync(HttpMethod.Post, "/me/books/clip", token!, new
        {
            title = $"Clip {Guid.NewGuid():N}"[..16],
            html = "<p>Hello world. This is a clipped article body for the deletion test.</p>",
            language = "en"
        }, ct);
        Assert.True(clipResp.IsSuccessStatusCode, $"clip failed: {clipResp.StatusCode}");
        var clipBody = await clipResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var userBookId = clipBody.GetProperty("userBookId").GetGuid();

        // Reading session against the clipped user book.
        var now = DateTimeOffset.UtcNow;
        var sessionResp = await SendAsync(HttpMethod.Post, "/me/reading/sessions", token!, new
        {
            userBookId,
            startedAt = now.AddMinutes(-5),
            endedAt = now,
            durationSeconds = 300,
            wordsRead = 100,
            startPercent = 0.0,
            endPercent = 0.5
        }, ct);
        Assert.True(sessionResp.IsSuccessStatusCode, $"session failed: {sessionResp.StatusCode}");

        // Sanity: the data is actually visible before deletion.
        Assert.True(await CountAsync("/me/vocabulary/words?search=", token!, ct) > 0, "vocab not present pre-delete");
        Assert.True(await CountAsync($"/me/highlights/{editionId}", token!, ct) > 0, "highlight not present pre-delete");
        Assert.True((await GetUserBooksAsync(token!, ct)).Contains(userBookId), "user book not present pre-delete");

        // 4. Delete the account.
        var delResp = await SendAsync(HttpMethod.Delete, "/me/account", token!, null, ct);
        Assert.Equal(HttpStatusCode.NoContent, delResp.StatusCode);

        // 5. The old access token is still signature-valid (60-min TTL) but the user
        // row is gone. Endpoints that load the user must treat it as unauthenticated
        // rather than acting on a dangling userId. /me/profile loads the user →
        // expect 401. A repeat DELETE (also loads the user) must likewise be a clean
        // 401, not a 500 from operating on a missing row.
        var profileResp = await SendAsync(HttpMethod.Get, "/me/profile", token!, null, ct);
        Assert.Equal(HttpStatusCode.Unauthorized, profileResp.StatusCode);

        var repeatDelResp = await SendAsync(HttpMethod.Delete, "/me/account", token!, null, ct);
        Assert.Equal(HttpStatusCode.Unauthorized, repeatDelResp.StatusCode);

        // 6. Representative dependent rows are gone (read via a FRESH login on the
        // same email — re-creates an empty user, proving the data didn't survive).
        var freshToken = await TestLoginAsync(_lastEmail!, ct);
        Assert.False(string.IsNullOrEmpty(freshToken), "re-login failed");

        Assert.Equal(0, await CountAsync("/me/vocabulary/words?search=", freshToken!, ct));
        Assert.Equal(0, await CountAsync($"/me/highlights/{editionId}", freshToken!, ct));
        Assert.DoesNotContain(userBookId, await GetUserBooksAsync(freshToken!, ct));

        // Cleanup the re-created empty user so we don't leak rows.
        await SendAsync(HttpMethod.Delete, "/me/account", freshToken!, null, ct);
    }

    // --- helpers ---

    private string? _lastEmail;

    private async Task<string?> CreateThrowawayUserAsync(CancellationToken ct)
    {
        _lastEmail = $"acct-delete-{Guid.NewGuid():N}@textstack.test";
        return await TestLoginAsync(_lastEmail, ct);
    }

    private async Task<string?> TestLoginAsync(string email, CancellationToken ct)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/auth/test-login");
        req.Headers.Host = TestHost;
        req.Headers.Add("X-Client", "mobile"); // → access token returned in body
        req.Content = JsonContent.Create(new { email });
        var resp = await _fixture.Client.SendAsync(req, ct);
        if (resp.StatusCode == HttpStatusCode.NotFound) return null; // test auth disabled
        if (!resp.IsSuccessStatusCode) return null;
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        return body.TryGetProperty("accessToken", out var t) ? t.GetString() : null;
    }

    private async Task<(Guid? editionId, Guid? chapterId)> DiscoverEditionChapterAsync(CancellationToken ct)
    {
        var listReq = new HttpRequestMessage(HttpMethod.Get, "/books?limit=1");
        listReq.Headers.Host = TestHost;
        var listResp = await _fixture.Client.SendAsync(listReq, ct);
        if (!listResp.IsSuccessStatusCode) return (null, null);
        var list = await listResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var items = list.GetProperty("items");
        if (items.GetArrayLength() == 0) return (null, null);
        var slug = items[0].GetProperty("slug").GetString();

        var bookReq = new HttpRequestMessage(HttpMethod.Get, $"/books/{slug}");
        bookReq.Headers.Host = TestHost;
        var bookResp = await _fixture.Client.SendAsync(bookReq, ct);
        if (!bookResp.IsSuccessStatusCode) return (null, null);
        var book = await bookResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var editionId = book.GetProperty("id").GetGuid();
        if (!book.TryGetProperty("chapters", out var chapters) || chapters.GetArrayLength() == 0)
            return (null, null);
        var chapterId = chapters[0].GetProperty("id").GetGuid();
        return (editionId, chapterId);
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method, string path, string token, object? body, CancellationToken ct)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Host = TestHost;
        req.Headers.Add("Authorization", $"Bearer {token}");
        if (body != null) req.Content = JsonContent.Create(body);
        return await _fixture.Client.SendAsync(req, ct);
    }

    private async Task<int> CountAsync(string listPath, string token, CancellationToken ct)
    {
        var resp = await SendAsync(HttpMethod.Get, listPath, token, null, ct);
        if (!resp.IsSuccessStatusCode) return -1;
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        // /me/vocabulary/words → { total, items }; /me/highlights/{id} → array.
        if (body.ValueKind == JsonValueKind.Array) return body.GetArrayLength();
        if (body.TryGetProperty("items", out var items)) return items.GetArrayLength();
        return -1;
    }

    private async Task<List<Guid>> GetUserBooksAsync(string token, CancellationToken ct)
    {
        // Clipped books live on the "read later" shelf (IsClip = true).
        var resp = await SendAsync(HttpMethod.Get, "/me/books?shelf=readlater", token, null, ct);
        var result = new List<Guid>();
        if (!resp.IsSuccessStatusCode) return result;
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var arr = body.ValueKind == JsonValueKind.Array ? body
            : body.TryGetProperty("items", out var items) ? items : default;
        if (arr.ValueKind == JsonValueKind.Array)
            foreach (var b in arr.EnumerateArray())
                if (b.TryGetProperty("id", out var id) && id.TryGetGuid(out var g))
                    result.Add(g);
        return result;
    }
}
