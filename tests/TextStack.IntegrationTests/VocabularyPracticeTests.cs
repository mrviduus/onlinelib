using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Practice mode contract:
/// <list type="bullet">
///   <item><c>GET /me/vocabulary/review?practice=true</c> returns <c>weeklyProgress=null</c>.</item>
///   <item><c>POST /me/vocabulary/review</c> with <c>isPractice=true</c> doesn't mutate Stage / IntervalDays / NextReviewAt.</item>
///   <item>Practice rows don't count against the weekly budget.</item>
/// </list>
/// </summary>
[Collection("VocabularySpiral")]
public class VocabularyPracticeTests : IClassFixture<AuthenticatedApiFixture>
{
    private readonly AuthenticatedApiFixture _auth;

    public VocabularyPracticeTests(AuthenticatedApiFixture auth)
    {
        _auth = auth;
    }

    private const string SrsLang = "de";

    private string UniqueWord(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..16];

    private async Task<HttpResponseMessage> SaveWordAsync(string word, string language, CancellationToken ct)
    {
        var req = _auth.CreateRequest(HttpMethod.Post, "/me/vocabulary/words");
        req.Content = JsonContent.Create(new { word, language, nativeLanguage = "en" });
        return await _auth.Client.SendAsync(req, ct);
    }

    private async Task<JsonElement> GetWordAsync(string wordId, CancellationToken ct)
    {
        var resp = await _auth.Client.SendAsync(
            _auth.CreateRequest(HttpMethod.Get, $"/me/vocabulary/words?search="), ct);
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        foreach (var w in body.GetProperty("items").EnumerateArray())
        {
            if (w.GetProperty("id").GetString() == wordId)
                return w.Clone();
        }
        throw new InvalidOperationException($"Word {wordId} not found");
    }

    private async Task DeleteWordAsync(string wordId, CancellationToken ct)
    {
        await _auth.Client.SendAsync(_auth.CreateRequest(HttpMethod.Delete, $"/me/vocabulary/words/{wordId}"), ct);
    }

    [Fact]
    public async Task GetReviewQueue_PracticeFlag_ReturnsNullWeeklyProgress()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");
        var ct = TestContext.Current.CancellationToken;

        var resp = await _auth.Client.SendAsync(
            _auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/review?practice=true"), ct);
        Assert.SkipWhen(IntegrationSkip.Unavailable(resp), "endpoint unavailable (404/500)");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);

        // Practice mode hides budget UI — null is the contract the FE relies on
        // to skip the WeeklyBudgetBar render.
        Assert.Equal(JsonValueKind.Null, body.GetProperty("weeklyProgress").ValueKind);
    }

    [Fact]
    public async Task SubmitReview_PracticeMode_DoesNotMutateSrsState()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");
        var ct = TestContext.Current.CancellationToken;

        // Need a real SRS-eligible word. "de" bypasses the EN frequency filter.
        var save = await SaveWordAsync(UniqueWord("zzpract"), SrsLang, ct);
        Assert.SkipWhen(IntegrationSkip.Unavailable(save), "endpoint unavailable (404/500)");
        save.EnsureSuccessStatusCode();
        var saveBody = await save.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.SkipWhen(saveBody.GetProperty("outcome").GetString() != "srs", "word not SRS-eligible (pending/lookup)");
        var wordId = saveBody.GetProperty("word").GetProperty("id").GetString()!;

        try
        {
            var before = await GetWordAsync(wordId, ct);
            var beforeStage = before.GetProperty("stage").GetInt32();
            var beforeInterval = before.GetProperty("intervalDays").GetDouble();
            var beforeNextReview = before.GetProperty("nextReviewAt").GetString();
            var beforeTotal = before.GetProperty("totalReviews").GetInt32();
            var beforeCorrect = before.GetProperty("correctReviews").GetInt32();

            var submit = _auth.CreateRequest(HttpMethod.Post, "/me/vocabulary/review");
            submit.Content = JsonContent.Create(new
            {
                wordId,
                isCorrect = true,
                responseTimeMs = 1500,
                isPractice = true,
            });
            var submitResp = await _auth.Client.SendAsync(submit, ct);
            Assert.SkipWhen(IntegrationSkip.Unavailable(submitResp), "endpoint unavailable (404/500)");
            submitResp.EnsureSuccessStatusCode();

            // Backend response echoes "no movement" — same stage in/out, same interval.
            var submitBody = await submitResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            Assert.Equal(beforeStage, submitBody.GetProperty("previousStage").GetInt32());
            Assert.Equal(beforeStage, submitBody.GetProperty("newStage").GetInt32());
            Assert.False(submitBody.GetProperty("stageChanged").GetBoolean());

            // DB state must match exactly — Stage / Interval / NextReviewAt frozen.
            var after = await GetWordAsync(wordId, ct);
            Assert.Equal(beforeStage, after.GetProperty("stage").GetInt32());
            Assert.Equal(beforeInterval, after.GetProperty("intervalDays").GetDouble());
            Assert.Equal(beforeNextReview, after.GetProperty("nextReviewAt").GetString());
            // Per plan: practice doesn't bump the word-level review counters.
            Assert.Equal(beforeTotal, after.GetProperty("totalReviews").GetInt32());
            Assert.Equal(beforeCorrect, after.GetProperty("correctReviews").GetInt32());
        }
        finally
        {
            await DeleteWordAsync(wordId, ct);
        }
    }

    [Fact]
    public async Task SubmitReview_PracticeMode_DoesNotConsumeWeeklyBudget()
    {
        Assert.SkipUnless(_auth.IsAuthenticated, "test auth unavailable");
        var ct = TestContext.Current.CancellationToken;

        var save = await SaveWordAsync(UniqueWord("zzbud"), SrsLang, ct);
        Assert.SkipWhen(IntegrationSkip.Unavailable(save), "endpoint unavailable (404/500)");
        save.EnsureSuccessStatusCode();
        var saveBody = await save.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        Assert.SkipWhen(saveBody.GetProperty("outcome").GetString() != "srs", "word not SRS-eligible (pending/lookup)");
        var wordId = saveBody.GetProperty("word").GetProperty("id").GetString()!;

        try
        {
            var queueBefore = await _auth.Client.SendAsync(
                _auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/review"), ct);
            queueBefore.EnsureSuccessStatusCode();
            var beforeBody = await queueBefore.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            var usedBefore = beforeBody.GetProperty("weeklyProgress").GetProperty("used").GetInt32();

            // 3 practice submissions — none should land in the weekly budget count.
            for (var i = 0; i < 3; i++)
            {
                var submit = _auth.CreateRequest(HttpMethod.Post, "/me/vocabulary/review");
                submit.Content = JsonContent.Create(new
                {
                    wordId,
                    isCorrect = true,
                    responseTimeMs = 1000,
                    isPractice = true,
                });
                var submitResp = await _auth.Client.SendAsync(submit, ct);
                Assert.SkipWhen(IntegrationSkip.Unavailable(submitResp), "endpoint unavailable (404/500)");
                submitResp.EnsureSuccessStatusCode();
            }

            var queueAfter = await _auth.Client.SendAsync(
                _auth.CreateRequest(HttpMethod.Get, "/me/vocabulary/review"), ct);
            queueAfter.EnsureSuccessStatusCode();
            var afterBody = await queueAfter.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            var usedAfter = afterBody.GetProperty("weeklyProgress").GetProperty("used").GetInt32();

            Assert.Equal(usedBefore, usedAfter);
        }
        finally
        {
            await DeleteWordAsync(wordId, ct);
        }
    }
}
