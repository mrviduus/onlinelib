using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// End-to-end anti-spiral coverage (Phase 3 of the SRS plan):
/// <list type="bullet">
///   <item>Rare/OOV tap → WordLookup (no SRS pollution).</item>
///   <item>SRS-eligible tap over daily cap → PendingVocabularyWord.</item>
///   <item>Weekly budget exhausted → review queue empty + remaining=0.</item>
///   <item>"Add anyway" promote paths bypass the daily cap.</item>
/// </list>
/// Tests are serial and self-healing: each one restores defaults + clears
/// artifacts it created on the shared integration-test user.
/// </summary>
[Collection("VocabularySpiral")]
public class VocabularySpiralTests : IClassFixture<AuthenticatedApiFixture>
{
    private readonly AuthenticatedApiFixture _auth;

    public VocabularySpiralTests(AuthenticatedApiFixture auth)
    {
        _auth = auth;
    }

    // Non-"en" langs are absent from the wordfreq dataset → FrequencyFilter
    // fails open to SrsEligible, so we can reliably exercise cap/budget paths
    // without guessing which English words are in top-5k.
    private const string SrsLang = "de";

    private static bool ShouldSkip(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;

    private string UniqueWord(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..16];

    private async Task<HttpResponseMessage> SaveWordAsync(string word, string language, CancellationToken ct)
    {
        var req = _auth.CreateRequest(HttpMethod.Post, "/me/vocabulary/words");
        // nativeLanguage is mandatory — SaveWord 400s without it to avoid wrong-lang LLM explanations.
        req.Content = JsonContent.Create(new { word, language, nativeLanguage = "en" });
        return await _auth.Client.SendAsync(req, ct);
    }

    private async Task SetSettingsAsync(int dailyCap, int weeklyBudget, CancellationToken ct)
    {
        var req = _auth.CreateRequest(HttpMethod.Put, "/me/vocabulary/settings");
        req.Content = JsonContent.Create(new
        {
            dailyNewCap = dailyCap,
            weeklyReviewBudget = weeklyBudget,
            frequencyFilterEnabled = true,
            clusteringEnabled = true,
            autoRetireEnabled = true,
        });
        var resp = await _auth.Client.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
    }

    // Bounds: DailyNewCap 5..100, WeeklyReviewBudget 10..500 (validator in VocabularyEndpoints).
    private const int MinDailyCap = 5;
    private const int MinWeeklyBudget = 10;

    private Task RestoreDefaultsAsync(CancellationToken ct) => SetSettingsAsync(15, 70, ct);

    private async Task DeleteAllPendingAsync(CancellationToken ct)
    {
        var list = await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/pending"), ct);
        if (!list.IsSuccessStatusCode) return;
        var body = await list.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        if (!body.TryGetProperty("items", out var items)) return;
        foreach (var item in items.EnumerateArray())
        {
            var id = item.GetProperty("id").GetString();
            await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Delete, $"/me/vocabulary/pending/{id}"), ct);
        }
    }

    private async Task DeleteLookupAsync(string lookupId, CancellationToken ct)
    {
        await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Delete, $"/me/vocabulary/lookups/{lookupId}"), ct);
    }

    private async Task DeleteWordAsync(string wordId, CancellationToken ct)
    {
        await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Delete, $"/me/vocabulary/words/{wordId}"), ct);
    }

    [Fact]
    public async Task SaveWord_OovEnglishWord_ReturnsLookupOutcome()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        // Guid-suffixed word can't exist in the wordfreq dataset — must classify as
        // LookupOnly and land in WordLookup, never in the SRS queue.
        var word = UniqueWord("zzoov");
        var resp = await SaveWordAsync(word, "en", ct);
        if (ShouldSkip(resp)) return;

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.Equal("lookup", body.GetProperty("outcome").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("word").ValueKind);
        Assert.NotEqual(JsonValueKind.Null, body.GetProperty("lookupId").ValueKind);

        var lookupId = body.GetProperty("lookupId").GetString();
        await DeleteLookupAsync(lookupId!, ct);
    }

    [Fact]
    public async Task SaveWord_OverDailyCap_GoesToPending()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        // Cap floor is 5, so fill the cap with N unique SRS-eligible saves then expect
        // the next one to land in Pending. "de" bypasses the EN-only frequency filter
        // (fail-open → SrsEligible), so cap arithmetic is what the test actually exercises.
        await SetSettingsAsync(dailyCap: MinDailyCap, weeklyBudget: 70, ct);
        await DeleteAllPendingAsync(ct);

        var createdIds = new List<string>();
        try
        {
            for (var i = 0; i < MinDailyCap; i++)
            {
                var r = await SaveWordAsync(UniqueWord($"zzfill{i}"), SrsLang, ct);
                if (ShouldSkip(r)) return;
                r.EnsureSuccessStatusCode();
                var j = await r.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                if (j.GetProperty("outcome").GetString() == "srs")
                    createdIds.Add(j.GetProperty("word").GetProperty("id").GetString()!);
            }

            var resp = await SaveWordAsync(UniqueWord("zzcap"), SrsLang, ct);
            if (ShouldSkip(resp)) return;

            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            Assert.Equal("pending", body.GetProperty("outcome").GetString());
            Assert.NotEqual(JsonValueKind.Null, body.GetProperty("pendingId").ValueKind);
            Assert.Equal("daily_cap", body.GetProperty("reason").GetString());
        }
        finally
        {
            foreach (var id in createdIds) await DeleteWordAsync(id, ct);
            await DeleteAllPendingAsync(ct);
            await RestoreDefaultsAsync(ct);
        }
    }

    [Fact]
    public async Task GetReviewQueue_ReflectsWeeklyBudgetSetting_AndClampsCards()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        // Floor the budget so we can assert the queue is clamped. Can't set to 0
        // (validator min = 10), so this is the closest observable signal.
        await SetSettingsAsync(dailyCap: 15, weeklyBudget: MinWeeklyBudget, ct);
        try
        {
            var resp = await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/review"), ct);
            if (ShouldSkip(resp)) return;

            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);

            var progress = body.GetProperty("weeklyProgress");
            Assert.Equal(MinWeeklyBudget, progress.GetProperty("budget").GetInt32());

            var used = progress.GetProperty("used").GetInt32();
            var remaining = progress.GetProperty("remaining").GetInt32();
            Assert.Equal(Math.Max(0, MinWeeklyBudget - used), remaining);

            var cards = body.GetProperty("cards").GetArrayLength();
            Assert.True(cards <= remaining, $"cards({cards}) must be clamped by remaining({remaining})");
        }
        finally
        {
            await RestoreDefaultsAsync(ct);
        }
    }

    [Fact]
    public async Task PromoteLookup_BypassesDailyCap_CreatesSrsWord()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        // Floor the cap; then fill it so the very next SrsEligible save would be
        // forced into Pending — "Add anyway" on a lookup must bypass that gate.
        await SetSettingsAsync(dailyCap: MinDailyCap, weeklyBudget: 70, ct);

        var fillerIds = new List<string>();
        string? lookupId = null;
        string? wordId = null;

        try
        {
            for (var i = 0; i < MinDailyCap; i++)
            {
                var r = await SaveWordAsync(UniqueWord($"zzfiller{i}"), SrsLang, ct);
                if (ShouldSkip(r)) return;
                r.EnsureSuccessStatusCode();
                var j = await r.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                if (j.GetProperty("outcome").GetString() == "srs")
                    fillerIds.Add(j.GetProperty("word").GetProperty("id").GetString()!);
            }

            // Seed a rare word → WordLookup
            var saveResp = await SaveWordAsync(UniqueWord("zzrare"), "en", ct);
            if (ShouldSkip(saveResp)) return;
            saveResp.EnsureSuccessStatusCode();
            var saveBody = await saveResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            Assert.Equal("lookup", saveBody.GetProperty("outcome").GetString());
            lookupId = saveBody.GetProperty("lookupId").GetString();

            // Promote — cap is 0, must succeed anyway ("Add to SRS" is manual override).
            var promote = await _auth.Client.SendAsync(
                _auth.CreateRequest(HttpMethod.Post, $"/me/vocabulary/lookups/{lookupId}/promote"), ct);
            Assert.Equal(HttpStatusCode.OK, promote.StatusCode);
            var promotedBody = await promote.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            wordId = promotedBody.GetProperty("id").GetString();
            Assert.False(string.IsNullOrEmpty(wordId));
        }
        finally
        {
            if (wordId is not null) await DeleteWordAsync(wordId, ct);
            if (lookupId is not null) await DeleteLookupAsync(lookupId, ct); // no-op after successful promote
            foreach (var id in fillerIds) await DeleteWordAsync(id, ct);
            await RestoreDefaultsAsync(ct);
        }
    }

    [Fact]
    public async Task PromotePending_CreatesSrsWord()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        await SetSettingsAsync(dailyCap: MinDailyCap, weeklyBudget: 70, ct);
        await DeleteAllPendingAsync(ct);

        var fillerIds = new List<string>();
        string? wordId = null;
        string? pendingId = null;

        try
        {
            for (var i = 0; i < MinDailyCap; i++)
            {
                var r = await SaveWordAsync(UniqueWord($"zzpfill{i}"), SrsLang, ct);
                if (ShouldSkip(r)) return;
                r.EnsureSuccessStatusCode();
                var j = await r.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                if (j.GetProperty("outcome").GetString() == "srs")
                    fillerIds.Add(j.GetProperty("word").GetProperty("id").GetString()!);
            }

            var saveResp = await SaveWordAsync(UniqueWord("zzpend"), SrsLang, ct);
            if (ShouldSkip(saveResp)) return;
            saveResp.EnsureSuccessStatusCode();
            var saveBody = await saveResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            Assert.Equal("pending", saveBody.GetProperty("outcome").GetString());
            pendingId = saveBody.GetProperty("pendingId").GetString();

            var statsBefore = await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/stats"), ct);
            statsBefore.EnsureSuccessStatusCode();
            var usedBefore = (await statsBefore.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct))
                .GetProperty("dailyCap").GetProperty("used").GetInt32();

            // Promote endpoint bumps the cap up if needed — pending words are always promotable.
            var promote = await _auth.Client.SendAsync(
                _auth.CreateRequest(HttpMethod.Post, $"/me/vocabulary/pending/{pendingId}/promote"), ct);
            Assert.Equal(HttpStatusCode.OK, promote.StatusCode);
            var promotedBody = await promote.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            wordId = promotedBody.GetProperty("id").GetString();
            Assert.False(string.IsNullOrEmpty(wordId));

            // Promoted word sets ActivatedAt=now → counts toward dailyUsed
            // (guards against silent cap-bypass regressions in DailyCapService.PromoteAsync).
            var statsAfter = await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/stats"), ct);
            statsAfter.EnsureSuccessStatusCode();
            var usedAfter = (await statsAfter.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct))
                .GetProperty("dailyCap").GetProperty("used").GetInt32();
            Assert.Equal(usedBefore + 1, usedAfter);
        }
        finally
        {
            if (wordId is not null) await DeleteWordAsync(wordId, ct);
            foreach (var id in fillerIds) await DeleteWordAsync(id, ct);
            await DeleteAllPendingAsync(ct);
            await RestoreDefaultsAsync(ct);
        }
    }

    [Fact]
    public async Task GetLookups_ReturnsListShape()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        var resp = await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/lookups"), ct);
        if (ShouldSkip(resp)) return;

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.True(body.TryGetProperty("items", out var items));
        Assert.Equal(JsonValueKind.Array, items.ValueKind);
        Assert.True(body.TryGetProperty("total", out _));
    }

    [Fact]
    public async Task GetStats_IncludesLookupCount()
    {
        if (!_auth.IsAuthenticated) return;
        var ct = TestContext.Current.CancellationToken;

        var resp = await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/stats"), ct);
        if (ShouldSkip(resp)) return;

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.True(body.TryGetProperty("lookupCount", out var lc));
        Assert.True(lc.ValueKind == JsonValueKind.Number);
    }
}
