using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Tutor agent tool (AI-Agent-2): the learner's due / near-due SRS cards — the ones the spaced-repetition
/// schedule says to review now. Wraps a vocab query strictly scoped to <see cref="ToolContext.UserId"/>,
/// ordered most-overdue first, capped to protect the prompt. Each row carries the real <c>wordId</c> + SRS
/// stage + accuracy so a planned item can only ever name a card that was actually retrieved (the parser
/// re-projects identity from these rows — see <c>TutorAgent</c>).
/// </summary>
public sealed class GetDueVocabularyTool : ITool
{
    public const int DefaultLimit = 12;
    public const int MaxLimit = 30;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30,
              "description": "Max due cards to return (default 12)"
            }
          },
          "additionalProperties": false
        }
        """);

    public string Name => "get_due_vocabulary";

    public string Description =>
        "Fetch the learner's due / near-due spaced-repetition vocabulary cards (the ones scheduled to review " +
        "now), most-overdue first. Each card carries its id, word, SRS stage, consecutive-correct streak, " +
        "lifetime accuracy and due date. Use to plan which cards to surface this session.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.UserId is not { } userId)
            throw new InvalidOperationException("No user in context — get_due_vocabulary needs a signed-in user.");

        var limit = Math.Clamp(ToolJson.GetInt(args, "limit") ?? DefaultLimit, 1, MaxLimit);
        var now = DateTimeOffset.UtcNow;
        // "Near-due": include cards coming due within the day so a short session isn't empty between intervals.
        var horizon = now.AddDays(1);

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var words = await db.VocabularyWords
            .Where(v => v.UserId == userId && !v.IsRetired && v.NextReviewAt <= horizon)
            .OrderBy(v => v.NextReviewAt)
            .Take(limit)
            .Select(v => new
            {
                wordId = v.Id,
                word = v.Word,
                stage = v.Stage,
                consecutiveCorrect = v.ConsecutiveCorrect,
                lastAccuracy = v.TotalReviews > 0 ? (double)v.CorrectReviews / v.TotalReviews : (double?)null,
                // Without this the planner could not tell a card nobody has
                // answered from one answered wrong twice: both arrive with
                // consecutiveCorrect 0, and the only difference is a null
                // accuracy, which nothing explained. It told a reader "You keep
                // missing this word" about a card created a minute earlier.
                totalReviews = v.TotalReviews,
                hasSentence = v.Sentence != null && v.Sentence != "",
                dueAt = v.NextReviewAt,
            })
            .ToListAsync(ct);

        return ToolJson.Result(new { count = words.Count, words });
    }
}
