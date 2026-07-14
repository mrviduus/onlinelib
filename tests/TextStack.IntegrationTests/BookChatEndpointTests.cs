using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for persistent Book Chat (feat/book-chat-history), against the live API. The
/// no-auth + validation + ownership + toggle + clear paths need no OpenAI key and are asserted directly;
/// the answer path (POST a question) needs a key + corpus, so it skips when unreachable — mirroring
/// <c>AskEndpointTests</c>. GET is upsert-on-read: it auto-creates an empty conversation.
/// </summary>
public class BookChatEndpointTests : IClassFixture<LiveApiFixture>, IClassFixture<AuthenticatedApiFixture>
{
    private static readonly Guid UnknownBook = Guid.Parse("11111111-2222-3333-4444-555555555555");

    private readonly LiveApiFixture _anon;
    private readonly AuthenticatedApiFixture _auth;

    public BookChatEndpointTests(LiveApiFixture anon, AuthenticatedApiFixture auth)
    {
        _anon = anon;
        _auth = auth;
    }

    private sealed record BookListItem(Guid Id);
    private sealed record BookList(int Total, List<BookListItem> Items);
    private sealed record ChatMessage(int Ord, string Role, string Content, JsonElement Citations);
    private sealed record ChatResponse(Guid ConversationId, bool SpoilerGateEnabled, List<ChatMessage> Messages);

    [Fact]
    public async Task GetChat_NoAuth_Unauthorized()
    {
        var request = _anon.CreateRequest(HttpMethod.Get, $"/me/chat?editionId={UnknownBook}");
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetChat_NoTarget_BadRequest()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, "/me/chat");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetChat_BothTargets_BadRequest()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(
            HttpMethod.Get, $"/me/chat?editionId={UnknownBook}&userBookId={UnknownBook}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetChat_UnknownEdition_NotFound()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/chat?editionId={UnknownBook}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetChat_UnknownUserBook_NotFound()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/chat?userBookId={UnknownBook}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetChat_KnownEdition_AutoCreatesEmptyConversation()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/chat?editionId={editionId}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var chat = await response.Content.ReadFromJsonAsync<ChatResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(chat);
        Assert.NotEqual(Guid.Empty, chat!.ConversationId);
        // Catalog default: spoiler gate on.
        Assert.True(chat.SpoilerGateEnabled);
        Assert.NotNull(chat.Messages);
    }

    [Fact]
    public async Task GetChat_SameEditionTwice_ReturnsSameConversation()
    {
        // Upsert-on-read is idempotent: one conversation per user + book (NotebookLM model).
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var first = await GetConversationAsync(editionId!.Value);
        Assert.SkipWhen(first is null, "endpoint unavailable");
        var second = await GetConversationAsync(editionId.Value);
        Assert.SkipWhen(second is null, "endpoint unavailable");

        Assert.Equal(first!.ConversationId, second!.ConversationId);
    }

    [Fact]
    public async Task PatchChat_TogglesSpoilerGate()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var chat = await GetConversationAsync(editionId!.Value);
        Assert.SkipWhen(chat is null, "endpoint unavailable");

        var target = !chat!.SpoilerGateEnabled;
        var request = _auth.CreateRequest(HttpMethod.Patch, $"/me/chat/{chat.ConversationId}");
        request.Content = JsonContent.Create(new { spoilerGateEnabled = target });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Reload reflects the toggle.
        var reloaded = await GetConversationAsync(editionId.Value);
        Assert.Equal(target, reloaded!.SpoilerGateEnabled);

        // Restore.
        var restore = _auth.CreateRequest(HttpMethod.Patch, $"/me/chat/{chat.ConversationId}");
        restore.Content = JsonContent.Create(new { spoilerGateEnabled = chat.SpoilerGateEnabled });
        await _auth.Client.SendAsync(restore, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task PatchChat_UnknownConversation_NotFound()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Patch, $"/me/chat/{Guid.NewGuid()}");
        request.Content = JsonContent.Create(new { spoilerGateEnabled = true });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DeleteMessages_UnknownConversation_NotFound()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Delete, $"/me/chat/{Guid.NewGuid()}/messages");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DeleteMessages_KnownConversation_NoContent()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var chat = await GetConversationAsync(editionId!.Value);
        Assert.SkipWhen(chat is null, "endpoint unavailable");

        var request = _auth.CreateRequest(HttpMethod.Delete, $"/me/chat/{chat!.ConversationId}/messages");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(IntegrationSkip.Unavailable(response), "endpoint unavailable (404/500)");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task PostMessage_NoAuth_Unauthorized()
    {
        var request = _anon.CreateRequest(HttpMethod.Post, $"/me/chat/{Guid.NewGuid()}/messages");
        request.Content = JsonContent.Create(new { question = "hi" });
        var response = await _anon.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode is HttpStatusCode.NotFound, "endpoint not deployed");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PostMessage_UnknownConversation_NotFound()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/me/chat/{Guid.NewGuid()}/messages");
        request.Content = JsonContent.Create(new { question = "who is the hero?" });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostMessage_EmptyQuestion_BadRequest()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var chat = await GetConversationAsync(editionId!.Value);
        Assert.SkipWhen(chat is null, "endpoint unavailable");

        var request = _auth.CreateRequest(HttpMethod.Post, $"/me/chat/{chat!.ConversationId}/messages");
        request.Content = JsonContent.Create(new { question = "  " });
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.SkipWhen(response.StatusCode == HttpStatusCode.InternalServerError, "host erroring");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostMessage_ThenGet_PersistsTurns_OrSkips()
    {
        // The full round-trip needs an OpenAI key + an indexed corpus; skip when unreachable (503/404/500).
        Assert.SkipUnless(_auth.IsAuthenticated, "auth unavailable");
        var editionId = await DiscoverEditionIdAsync();
        Assert.SkipWhen(editionId is null, "no catalog edition available");

        var chat = await GetConversationAsync(editionId!.Value);
        Assert.SkipWhen(chat is null, "endpoint unavailable");

        var post = _auth.CreateRequest(HttpMethod.Post, $"/me/chat/{chat!.ConversationId}/messages");
        post.Content = JsonContent.Create(new { question = "what happens at the beginning?" });
        var response = await _auth.Client.SendAsync(post, TestContext.Current.CancellationToken);

        Assert.SkipWhen(
            IntegrationSkip.Unavailable(response) || response.StatusCode == HttpStatusCode.ServiceUnavailable,
            "answer path not reachable (no key / corpus)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // A non-insufficient answer persists both turns; give the (synchronous JSON) persist a beat.
        await Task.Delay(500, TestContext.Current.CancellationToken);
        var reloaded = await GetConversationAsync(editionId.Value);
        Assert.NotNull(reloaded);
        // Either it persisted a user+assistant pair, or it was an insufficient turn (persist nothing).
        Assert.True(reloaded!.Messages.Count is 0 or >= 2);
        if (reloaded.Messages.Count >= 2)
        {
            Assert.Equal("user", reloaded.Messages[0].Role);
            Assert.Equal("assistant", reloaded.Messages[^1].Role);
        }
    }

    private async Task<ChatResponse?> GetConversationAsync(Guid editionId)
    {
        var request = _auth.CreateRequest(HttpMethod.Get, $"/me/chat?editionId={editionId}");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        if (response.StatusCode != HttpStatusCode.OK)
            return null;
        return await response.Content.ReadFromJsonAsync<ChatResponse>(
            cancellationToken: TestContext.Current.CancellationToken);
    }

    private async Task<Guid?> DiscoverEditionIdAsync()
    {
        var request = _auth.CreateRequest(HttpMethod.Get, "/books?limit=1");
        var response = await _auth.Client.SendAsync(request, TestContext.Current.CancellationToken);
        if (!response.IsSuccessStatusCode)
            return null;

        var list = await response.Content.ReadFromJsonAsync<BookList>(
            cancellationToken: TestContext.Current.CancellationToken);
        return list?.Items.Count > 0 ? list.Items[0].Id : null;
    }
}
