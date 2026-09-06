using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// <c>GET /dictionary/{lang}/{word}</c> against the live stack. api.dictionaryapi.dev is a third
/// party and goes down (it did, on 2026-09-05), so these tests assert the parts of the contract
/// that hold in BOTH worlds — the status codes, the error codes, and the latency budget — rather
/// than assuming a healthy upstream. The old versions of these tests silently <c>return;</c>d on
/// 502/503/504, which meant the endpoint answering 504 after ten seconds still produced a green
/// suite. The cache/staleness policy itself is unit-tested in <c>DictionaryCacheTests</c> where it
/// needs neither a network nor a stack.
/// </summary>
public class DictionaryEndpointTests(LiveApiFixture fixture) : IClassFixture<LiveApiFixture>
{
    /// <summary>
    /// Server budget is <c>Dictionary:TimeoutSeconds</c> (3s). This allows generous slack for the
    /// hop through nginx/compose but is far under the 10s the endpoint used to spend before failing.
    /// </summary>
    private static readonly TimeSpan LatencyBudget = TimeSpan.FromSeconds(7);

    private async Task<(HttpResponseMessage Response, TimeSpan Elapsed)> LookupAsync(string path)
    {
        var request = fixture.CreateRequest(HttpMethod.Get, path);
        var sw = Stopwatch.StartNew();
        var response = await fixture.Client.SendAsync(request, TestContext.Current.CancellationToken);
        sw.Stop();
        return (response, sw.Elapsed);
    }

    #region contract

    [Fact]
    public async Task LookupWord_ValidEnglishWord_Returns200OrUnavailable()
    {
        var (response, _) = await LookupAsync("/dictionary/en/hello");
        Assert.SkipWhen(IntegrationSkip.Unavailable(response) && !await IsNotFoundBodyAsync(response),
            "Dictionary endpoint not deployed on the target stack");

        // Exactly two legal outcomes for a real word: the definition, or an honest "we could not
        // ask". 404 would be a lie, and 502/504 are no longer part of the contract.
        Assert.True(
            response.StatusCode is HttpStatusCode.OK or HttpStatusCode.ServiceUnavailable,
            $"expected 200 or 503, got {(int)response.StatusCode}");

        if (response.StatusCode == HttpStatusCode.ServiceUnavailable)
        {
            await AssertErrorCodeAsync(response, "dictionary_unavailable");
            return;
        }

        var result = await ReadEntryAsync(response);
        Assert.Equal("hello", result.Word.ToLowerInvariant());
        Assert.NotEmpty(result.Definitions);
    }

    [Fact]
    public async Task LookupWord_NonExistentWord_Returns404NotFoundCode()
    {
        var (response, _) = await LookupAsync("/dictionary/en/asdfghjklzxcv");

        // "no such word" and "we could not ask" must never be confusable — that is the whole point
        // of the code field. Whichever we get, it has to carry the matching code.
        if (response.StatusCode == HttpStatusCode.ServiceUnavailable)
        {
            await AssertErrorCodeAsync(response, "dictionary_unavailable");
            return;
        }

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorCodeAsync(response, "not_found");
    }

    [Fact]
    public async Task LookupWord_UpstreamFailure_NeverReturns502Or504()
    {
        // The regression this whole change exists to prevent: a dead upstream used to surface as
        // 504 after ten seconds. It is now 503 (or a stale 200), and it is fast.
        var (response, elapsed) = await LookupAsync("/dictionary/en/serendipity");

        Assert.False(response.StatusCode is HttpStatusCode.BadGateway or HttpStatusCode.GatewayTimeout,
            $"dictionary answered {(int)response.StatusCode}; the contract is 200 | 404 | 503");
        Assert.True(elapsed < LatencyBudget,
            $"dictionary took {elapsed.TotalSeconds:F1}s, budget is {LatencyBudget.TotalSeconds:F0}s");
    }

    [Fact]
    public async Task LookupWord_AlwaysReportsCacheDisposition()
    {
        var (response, _) = await LookupAsync("/dictionary/en/lexicon");
        Assert.SkipWhen(IntegrationSkip.Unavailable(response) && !await IsNotFoundBodyAsync(response),
            "Dictionary endpoint not deployed on the target stack");

        Assert.True(response.Headers.TryGetValues("X-Dictionary-Cache", out var values),
            "X-Dictionary-Cache header missing — ops cannot tell a stale answer from a live one");
        Assert.Contains(values.Single(), new[] { "hit", "miss", "stale", "negative" });
    }

    #endregion

    #region cache

    [Fact]
    public async Task LookupWord_RepeatedLookup_IsServedFromServerCache()
    {
        var (first, _) = await LookupAsync("/dictionary/en/serendipity");
        Assert.SkipWhen(first.StatusCode == HttpStatusCode.ServiceUnavailable,
            "upstream dictionary is down and the server cache is cold — nothing to prime with");
        Assert.SkipWhen(IntegrationSkip.Unavailable(first) && !await IsNotFoundBodyAsync(first),
            "Dictionary endpoint not deployed on the target stack");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Second lookup differs in case and whitespace: the cache key normalizes both, so it must
        // still hit. If it misses, every capitalised word at the start of a sentence is a fresh
        // upstream call and the outage fallback covers half of what it should.
        var (second, elapsed) = await LookupAsync("/dictionary/EN/Serendipity");

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal("hit", second.Headers.GetValues("X-Dictionary-Cache").Single());
        var entry = await ReadEntryAsync(second);
        Assert.True(entry.Cached, "second lookup should be served from the server cache");
        Assert.False(entry.Stale, "a fresh cache entry must not be flagged stale");
        Assert.True(elapsed < TimeSpan.FromSeconds(2), $"cache hit took {elapsed.TotalSeconds:F1}s");
    }

    [Fact]
    public async Task LookupWord_NonExistentWord_IsNegativeCached()
    {
        var (first, _) = await LookupAsync("/dictionary/en/qwertyuiopzxcv");
        Assert.SkipWhen(first.StatusCode == HttpStatusCode.ServiceUnavailable,
            "upstream dictionary is down — cannot establish a negative entry");
        Assert.Equal(HttpStatusCode.NotFound, first.StatusCode);

        var (second, _) = await LookupAsync("/dictionary/en/qwertyuiopzxcv");

        Assert.Equal(HttpStatusCode.NotFound, second.StatusCode);
        // "negative" proves the typo did NOT go back out to upstream.
        Assert.Equal("negative", second.Headers.GetValues("X-Dictionary-Cache").Single());
        await AssertErrorCodeAsync(second, "not_found");
    }

    #endregion

    #region validation (no upstream involved)

    [Fact]
    public async Task LookupWord_EmptyWord_Returns400Or404()
    {
        var (response, _) = await LookupAsync("/dictionary/en/");

        // Empty path segment may be rejected by routing before the handler sees it.
        Assert.True(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task LookupWord_WordTooLong_Returns400()
    {
        var (response, elapsed) = await LookupAsync($"/dictionary/en/{new string('a', 150)}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Validation must never reach upstream, so it is fast even during an outage.
        Assert.True(elapsed < TimeSpan.FromSeconds(2), $"validation took {elapsed.TotalSeconds:F1}s");
    }

    #endregion

    private static async Task<DictionaryEntryDto> ReadEntryAsync(HttpResponseMessage response)
    {
        var result = await response.Content.ReadFromJsonAsync<DictionaryEntryDto>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(result);
        return result;
    }

    private static async Task AssertErrorCodeAsync(HttpResponseMessage response, string expectedCode)
    {
        var error = await response.Content.ReadFromJsonAsync<DictionaryErrorDto>(
            cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(error);
        Assert.Equal(expectedCode, error.Code);
        Assert.False(string.IsNullOrWhiteSpace(error.Message));
    }

    /// <summary>
    /// A 404 from this route is ambiguous between "route not deployed" and "word has no definition".
    /// The body disambiguates: our handler always sends <c>code</c>, ASP.NET's routing 404 does not.
    /// </summary>
    private static async Task<bool> IsNotFoundBodyAsync(HttpResponseMessage response)
    {
        if (response.StatusCode != HttpStatusCode.NotFound)
            return false;
        try
        {
            var error = await response.Content.ReadFromJsonAsync<DictionaryErrorDto>(
                cancellationToken: TestContext.Current.CancellationToken);
            return error?.Code is not null;
        }
        catch (Exception ex) when (ex is HttpRequestException or System.Text.Json.JsonException or NotSupportedException)
        {
            return false;
        }
    }

    private record DictionaryEntryDto(
        string Word,
        string? Phonetic,
        DictionaryMeaningDto[] Definitions,
        bool Cached,
        bool Stale);

    private record DictionaryMeaningDto(string PartOfSpeech, DictionaryDefinitionDto[] Definitions);

    private record DictionaryDefinitionDto(string Definition, string? Example);

    private record DictionaryErrorDto(string Message, string? Code);
}
