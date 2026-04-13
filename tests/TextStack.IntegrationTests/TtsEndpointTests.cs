using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Integration tests for TTS endpoints.
/// Requires: docker compose up (API must be running, Edge TTS needs internet)
/// </summary>
public class TtsEndpointTests : IClassFixture<LiveApiFixture>
{
    private readonly LiveApiFixture _fixture;

    public TtsEndpointTests(LiveApiFixture fixture)
    {
        _fixture = fixture;
    }

    #region GET /tts

    [Fact]
    public async Task Synthesize_ValidRequest_Returns200Audio()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=hello&lang=en");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        // Edge TTS might not be reachable from Docker, accept 502
        if (response.StatusCode == HttpStatusCode.BadGateway) return;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("audio/mpeg", response.Content.Headers.ContentType?.MediaType);

        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        Assert.True(bytes.Length > 100, "Audio should be non-trivial size");
    }

    [Fact]
    public async Task Synthesize_Ukrainian_Returns200()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=%D0%BF%D1%80%D0%B8%D0%B2%D1%96%D1%82&lang=uk");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode == HttpStatusCode.BadGateway) return;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Synthesize_WithSpeed_Returns200()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=test&lang=en&speed=1.5");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode == HttpStatusCode.BadGateway) return;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Synthesize_EmptyText_Returns400()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=&lang=en");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Synthesize_MissingText_Returns400()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts?lang=en");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Synthesize_MissingLang_Returns400()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=hello");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Synthesize_TextTooLong_Returns400()
    {
        var longText = new string('a', 600);
        var request = _fixture.CreateRequest(HttpMethod.Get, $"/tts?text={longText}&lang=en");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Synthesize_CachedRequest_ReturnsSameSize()
    {
        // First request
        var request1 = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=cache-test&lang=en");
        var response1 = await _fixture.Client.SendAsync(request1, TestContext.Current.CancellationToken);
        if (response1.StatusCode == HttpStatusCode.BadGateway) return;

        Assert.Equal(HttpStatusCode.OK, response1.StatusCode);
        var bytes1 = await response1.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);

        // Second request (should come from cache)
        var request2 = _fixture.CreateRequest(HttpMethod.Get, "/tts?text=cache-test&lang=en");
        var response2 = await _fixture.Client.SendAsync(request2, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response2.StatusCode);
        var bytes2 = await response2.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);

        Assert.Equal(bytes1.Length, bytes2.Length);
    }

    #endregion

    #region GET /tts/voices

    [Fact]
    public async Task GetVoices_NoFilter_ReturnsVoices()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts/voices");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode == HttpStatusCode.BadGateway) return;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var voices = await response.Content.ReadFromJsonAsync<VoiceInfo[]>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(voices);
        Assert.True(voices.Length > 0, "Should return at least one voice");
    }

    [Fact]
    public async Task GetVoices_FilterByEn_ReturnsEnglishVoices()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts/voices?lang=en");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode == HttpStatusCode.BadGateway) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var voices = await response.Content.ReadFromJsonAsync<VoiceInfo[]>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(voices);
        Assert.All(voices, v => Assert.StartsWith("en", v.Locale, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task GetVoices_FilterByUk_ReturnsUkrainianVoices()
    {
        var request = _fixture.CreateRequest(HttpMethod.Get, "/tts/voices?lang=uk");
        var response = await _fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);

        if (response.StatusCode == HttpStatusCode.BadGateway) return;
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var voices = await response.Content.ReadFromJsonAsync<VoiceInfo[]>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(voices);
        Assert.True(voices.Length > 0, "Should have Ukrainian voices");
        Assert.All(voices, v => Assert.StartsWith("uk", v.Locale, StringComparison.OrdinalIgnoreCase));
    }

    #endregion

    private record VoiceInfo(string Name, string ShortName, string Gender, string Locale, string Language);
}
