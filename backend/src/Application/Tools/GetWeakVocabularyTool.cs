using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Tutor agent tool (AI-Agent-2): the learner's WEAKEST cards — lowest accuracy / earliest stage / shortest
/// correct streak — the ones to prioritize regardless of whether they're strictly due yet. Wraps a vocab
/// query scoped to <see cref="ToolContext.UserId"/>, considering only cards with review history (a weak word
/// is one the learner has demonstrably struggled with). Same row shape as <c>get_due_vocabulary</c> so the
/// parser re-projects identity from these rows too (anti-hallucination).
/// </summary>
public sealed class GetWeakVocabularyTool : ITool
{
    public const int DefaultLimit = 12;
    public const int MaxLimit = 30;
    // A word with very few reviews has no stable accuracy signal yet — require a minimum before calling it "weak".
    public const int MinReviews = 2;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30,
              "description": "Max weak cards to return (default 12)"
            }
          },
          "additionalProperties": false
        }
        """);

    public string Name => "get_weak_vocabulary";

    // The description used to end "— the words they keep getting wrong". It is a ranking, not a
    // verdict: there is no accuracy threshold in the query, so for a learner whose worst card sits at
    // 90% this returned that card and told the model it was one they keep getting wrong. The tutor
    // said so, to a reader, about a card answered twice. A prompt rule cannot reach a claim made in
    // the tool description — the model reads this first and believes it.
    public string Description =>
        "Fetch the learner's lowest-accuracy vocabulary cards, ranked worst-first, among cards they have " +
        "answered at least twice. This is a RANKING, not a judgement: the weakest card of a strong learner " +
        "is still returned, and may have good accuracy. Read totalReviews and lastAccuracy before saying " +
        "anything about how a card is going. Each card carries its id, word, SRS stage, consecutive-correct " +
        "streak, accuracy, review count and when it was last answered. Use alongside get_due_vocabulary.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.UserId is not { } userId)
            throw new InvalidOperationException("No user in context — get_weak_vocabulary needs a signed-in user.");

        var limit = Math.Clamp(ToolJson.GetInt(args, "limit") ?? DefaultLimit, 1, MaxLimit);

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        // Order by accuracy (correct/total) ascending, then earliest stage, then shortest streak — the weakest
        // first. Computed in SQL so the database does the ranking; only the top N cross the wire.
        var words = await db.VocabularyWords
            .Where(v => v.UserId == userId && !v.IsRetired && v.TotalReviews >= MinReviews)
            .OrderBy(v => (double)v.CorrectReviews / v.TotalReviews)
            .ThenBy(v => v.Stage)
            .ThenBy(v => v.ConsecutiveCorrect)
            .Take(limit + 1)
            .Select(v => new
            {
                wordId = v.Id,
                word = v.Word,
                stage = v.Stage,
                consecutiveCorrect = v.ConsecutiveCorrect,
                lastAccuracy = (double)v.CorrectReviews / v.TotalReviews,
                hasSentence = v.Sentence != null && v.Sentence != "",
                totalReviews = v.TotalReviews,
                // Two misses this morning and two misses last spring are the same accuracy and a
                // very different sentence to write about them.
                lastReviewedAt = v.LastReviewedAt,
            })
            .ToListAsync(ct);

        // `returned`, not `count`: the old name asserted a total while carrying a page size, so
        // "12 due" and "the first 12 of 400" were the same JSON. One extra row is fetched to answer
        // "is that all of them" without a second COUNT query — the string-returning tools have
        // carried a `truncated` flag since they were written, and the row-returning ones did not.
        var hasMore = words.Count > limit;
        if (hasMore) words.RemoveAt(words.Count - 1);

        return ToolJson.Result(new { returned = words.Count, hasMore, words });
    }
}
