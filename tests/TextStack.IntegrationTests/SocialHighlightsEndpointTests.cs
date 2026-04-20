using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for ambient social highlights: publish, like, report, hotspots.
/// Requires docker compose up with ENABLE_TEST_AUTH=true.
/// </summary>
public class SocialHighlightsEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public SocialHighlightsEndpointTests(LiveApiFixture fixture)
    {
        _fixture = fixture;
    }

    private async Task<string> LoginAsync(string email)
    {
        var req = _fixture.CreateRequest(HttpMethod.Post, "/auth/test-login");
        req.Content = JsonContent.Create(new { email });
        var resp = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        if (resp.StatusCode == HttpStatusCode.NotFound)
            throw new InvalidOperationException("test-login not enabled");
        resp.EnsureSuccessStatusCode();
        if (!resp.Headers.TryGetValues("Set-Cookie", out var cookies))
            throw new InvalidOperationException("no cookies");
        var parts = cookies.Select(c => c.Split(';')[0].Trim()).Where(s => !string.IsNullOrEmpty(s));
        return string.Join("; ", parts);
    }

    private HttpRequestMessage Req(HttpMethod m, string path, string cookies)
    {
        var r = _fixture.CreateRequest(m, path);
        r.Headers.Add("Cookie", cookies);
        return r;
    }

    private static async Task<(Guid editionId, Guid chapterId)> GetFirstEditionChapterAsync(HttpClient client, CancellationToken ct)
    {
        var booksReq = new HttpRequestMessage(HttpMethod.Get, "/books?limit=1");
        booksReq.Headers.Host = LiveApiFixture.TestHost;
        var books = await client.SendAsync(booksReq, ct);
        books.EnsureSuccessStatusCode();
        using var bjson = JsonDocument.Parse(await books.Content.ReadAsStringAsync(ct));
        var first = bjson.RootElement.GetProperty("items")[0];
        var slug = first.GetProperty("slug").GetString()!;

        var detailReq = new HttpRequestMessage(HttpMethod.Get, $"/books/{slug}");
        detailReq.Headers.Host = LiveApiFixture.TestHost;
        var detail = await client.SendAsync(detailReq, ct);
        detail.EnsureSuccessStatusCode();
        using var djson = JsonDocument.Parse(await detail.Content.ReadAsStringAsync(ct));
        var editionId = djson.RootElement.GetProperty("id").GetGuid();
        var chapterId = djson.RootElement.GetProperty("chapters")[0].GetProperty("id").GetGuid();
        return (editionId, chapterId);
    }

    private async Task<Guid> CreateHighlightAsync(string cookies, Guid editionId, Guid chapterId, string text, string? note, bool isPublic)
    {
        var req = Req(HttpMethod.Post, "/me/highlights", cookies);
        req.Content = JsonContent.Create(new
        {
            editionId,
            chapterId,
            anchorJson = $"{{\"prefix\":\"\",\"exact\":\"{text}\",\"suffix\":\"\",\"startOffset\":0,\"endOffset\":{text.Length},\"chapterId\":\"{chapterId}\"}}",
            color = "yellow",
            selectedText = text,
            noteText = note,
            isPublic,
        });
        var resp = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        return doc.RootElement.GetProperty("id").GetGuid();
    }

    private async Task DeleteHighlightAsync(string cookies, Guid id)
    {
        var req = Req(HttpMethod.Delete, $"/me/highlights/{id}", cookies);
        await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task GetHotspots_PublishedByOthers_ReturnsHotspotExcludingSelf()
    {
        var ct = TestContext.Current.CancellationToken;
        var aCookies = await LoginAsync($"social-itest-a-{Guid.NewGuid():N}@textstack.app");
        var bCookies = await LoginAsync($"social-itest-b-{Guid.NewGuid():N}@textstack.app");

        var (editionId, chapterId) = await GetFirstEditionChapterAsync(_fixture.Client, ct);
        var phrase = $"itest-phrase-{Guid.NewGuid():N}".Substring(0, 24);

        var aId = await CreateHighlightAsync(aCookies, editionId, chapterId, phrase, "note A", isPublic: true);

        try
        {
            // B sees it
            var bReq = Req(HttpMethod.Get, $"/books/{editionId}/chapters/{chapterId}/hotspots", bCookies);
            var bResp = await _fixture.Client.SendAsync(bReq, ct);
            bResp.EnsureSuccessStatusCode();
            using var bDoc = JsonDocument.Parse(await bResp.Content.ReadAsStringAsync(ct));
            Assert.Contains(bDoc.RootElement.EnumerateArray(), h => h.GetProperty("key").GetString() == phrase.ToLowerInvariant());

            // A does NOT see own
            var aReq = Req(HttpMethod.Get, $"/books/{editionId}/chapters/{chapterId}/hotspots", aCookies);
            var aResp = await _fixture.Client.SendAsync(aReq, ct);
            aResp.EnsureSuccessStatusCode();
            using var aDoc = JsonDocument.Parse(await aResp.Content.ReadAsStringAsync(ct));
            Assert.DoesNotContain(aDoc.RootElement.EnumerateArray(), h => h.GetProperty("key").GetString() == phrase.ToLowerInvariant());
        }
        finally { await DeleteHighlightAsync(aCookies, aId); }
    }

    [Fact]
    public async Task GetHotspots_PrivateHighlight_DoesNotAppear()
    {
        var ct = TestContext.Current.CancellationToken;
        var aCookies = await LoginAsync($"social-itest-p-{Guid.NewGuid():N}@textstack.app");
        var bCookies = await LoginAsync($"social-itest-q-{Guid.NewGuid():N}@textstack.app");

        var (editionId, chapterId) = await GetFirstEditionChapterAsync(_fixture.Client, ct);
        var phrase = $"private-{Guid.NewGuid():N}".Substring(0, 20);
        var id = await CreateHighlightAsync(aCookies, editionId, chapterId, phrase, "private", isPublic: false);

        try
        {
            var req = Req(HttpMethod.Get, $"/books/{editionId}/chapters/{chapterId}/hotspots", bCookies);
            var resp = await _fixture.Client.SendAsync(req, ct);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            Assert.DoesNotContain(doc.RootElement.EnumerateArray(), h => h.GetProperty("key").GetString() == phrase.ToLowerInvariant());
        }
        finally { await DeleteHighlightAsync(aCookies, id); }
    }

    [Fact]
    public async Task PublishHighlight_TogglesIsPublic()
    {
        var ct = TestContext.Current.CancellationToken;
        var cookies = await LoginAsync($"social-itest-pub-{Guid.NewGuid():N}@textstack.app");
        var (editionId, chapterId) = await GetFirstEditionChapterAsync(_fixture.Client, ct);
        var id = await CreateHighlightAsync(cookies, editionId, chapterId, "unpub", null, isPublic: false);

        try
        {
            var publishReq = Req(HttpMethod.Post, $"/me/highlights/{id}/publish", cookies);
            publishReq.Content = JsonContent.Create(new { isPublic = true });
            var publishResp = await _fixture.Client.SendAsync(publishReq, ct);
            Assert.Equal(HttpStatusCode.OK, publishResp.StatusCode);
            using var doc = JsonDocument.Parse(await publishResp.Content.ReadAsStringAsync(ct));
            Assert.True(doc.RootElement.GetProperty("isPublic").GetBoolean());
            Assert.False(doc.RootElement.GetProperty("publishedAt").ValueKind == JsonValueKind.Null);
        }
        finally { await DeleteHighlightAsync(cookies, id); }
    }

    [Fact]
    public async Task LikeHighlight_IncrementsCount_AndSelfLikeRejected()
    {
        var ct = TestContext.Current.CancellationToken;
        var aCookies = await LoginAsync($"social-itest-l-{Guid.NewGuid():N}@textstack.app");
        var bCookies = await LoginAsync($"social-itest-m-{Guid.NewGuid():N}@textstack.app");
        var (editionId, chapterId) = await GetFirstEditionChapterAsync(_fixture.Client, ct);
        var id = await CreateHighlightAsync(aCookies, editionId, chapterId, "likeme", "love this", isPublic: true);

        try
        {
            // self-like rejected
            var selfReq = Req(HttpMethod.Post, $"/me/highlights/{id}/like", aCookies);
            var selfResp = await _fixture.Client.SendAsync(selfReq, ct);
            Assert.Equal(HttpStatusCode.BadRequest, selfResp.StatusCode);

            // B likes
            var likeReq = Req(HttpMethod.Post, $"/me/highlights/{id}/like", bCookies);
            var likeResp = await _fixture.Client.SendAsync(likeReq, ct);
            likeResp.EnsureSuccessStatusCode();
            using var likeDoc = JsonDocument.Parse(await likeResp.Content.ReadAsStringAsync(ct));
            Assert.Equal(1, likeDoc.RootElement.GetProperty("likeCount").GetInt32());
            Assert.True(likeDoc.RootElement.GetProperty("liked").GetBoolean());

            // B likes again (idempotent)
            var likeReq2 = Req(HttpMethod.Post, $"/me/highlights/{id}/like", bCookies);
            var likeResp2 = await _fixture.Client.SendAsync(likeReq2, ct);
            likeResp2.EnsureSuccessStatusCode();
            using var likeDoc2 = JsonDocument.Parse(await likeResp2.Content.ReadAsStringAsync(ct));
            Assert.Equal(1, likeDoc2.RootElement.GetProperty("likeCount").GetInt32());

            // B unlikes
            var unlikeReq = Req(HttpMethod.Delete, $"/me/highlights/{id}/like", bCookies);
            var unlikeResp = await _fixture.Client.SendAsync(unlikeReq, ct);
            unlikeResp.EnsureSuccessStatusCode();
            using var unlikeDoc = JsonDocument.Parse(await unlikeResp.Content.ReadAsStringAsync(ct));
            Assert.Equal(0, unlikeDoc.RootElement.GetProperty("likeCount").GetInt32());
        }
        finally { await DeleteHighlightAsync(aCookies, id); }
    }

    [Fact]
    public async Task ReportHighlight_CreatesReport()
    {
        var ct = TestContext.Current.CancellationToken;
        var aCookies = await LoginAsync($"social-itest-r-{Guid.NewGuid():N}@textstack.app");
        var bCookies = await LoginAsync($"social-itest-s-{Guid.NewGuid():N}@textstack.app");
        var (editionId, chapterId) = await GetFirstEditionChapterAsync(_fixture.Client, ct);
        var id = await CreateHighlightAsync(aCookies, editionId, chapterId, "reportme", "bad note", isPublic: true);

        try
        {
            var reportReq = Req(HttpMethod.Post, $"/me/highlights/{id}/report", bCookies);
            reportReq.Content = JsonContent.Create(new { reason = "spam", note = "integration test" });
            var reportResp = await _fixture.Client.SendAsync(reportReq, ct);
            Assert.Equal(HttpStatusCode.Accepted, reportResp.StatusCode);

            // second report same user is idempotent (no-op, still 202)
            var report2 = Req(HttpMethod.Post, $"/me/highlights/{id}/report", bCookies);
            report2.Content = JsonContent.Create(new { reason = "spam" });
            var resp2 = await _fixture.Client.SendAsync(report2, ct);
            Assert.Equal(HttpStatusCode.Accepted, resp2.StatusCode);
        }
        finally { await DeleteHighlightAsync(aCookies, id); }
    }

    [Fact]
    public async Task GetHotspots_Guest_CanRead()
    {
        var ct = TestContext.Current.CancellationToken;
        var (editionId, chapterId) = await GetFirstEditionChapterAsync(_fixture.Client, ct);
        var req = _fixture.CreateRequest(HttpMethod.Get, $"/books/{editionId}/chapters/{chapterId}/hotspots");
        var resp = await _fixture.Client.SendAsync(req, ct);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);
    }

    [Fact]
    public async Task PublishHighlight_WithoutAuth_Returns401()
    {
        var req = _fixture.CreateRequest(HttpMethod.Post, $"/me/highlights/{Guid.NewGuid()}/publish");
        req.Content = JsonContent.Create(new { isPublic = true });
        var resp = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task LikeHighlight_WithoutAuth_Returns401()
    {
        var req = _fixture.CreateRequest(HttpMethod.Post, $"/me/highlights/{Guid.NewGuid()}/like");
        var resp = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task ReportHighlight_WithoutAuth_Returns401()
    {
        var req = _fixture.CreateRequest(HttpMethod.Post, $"/me/highlights/{Guid.NewGuid()}/report");
        req.Content = JsonContent.Create(new { reason = "spam" });
        var resp = await _fixture.Client.SendAsync(req, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
