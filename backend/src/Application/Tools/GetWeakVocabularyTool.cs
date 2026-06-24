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

    public string Description =>
        "Fetch the learner's WEAKEST vocabulary cards — lowest lifetime accuracy and earliest SRS stage — the " +
        "words they keep getting wrong, to prioritize this session. Each card carries its id, word, SRS stage, " +
        "consecutive-correct streak and accuracy. Use alongside get_due_vocabulary to target the hardest words.";

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
            .Take(limit)
            .Select(v => new
            {
                wordId = v.Id,
                word = v.Word,
                stage = v.Stage,
                consecutiveCorrect = v.ConsecutiveCorrect,
                lastAccuracy = (double)v.CorrectReviews / v.TotalReviews,
                hasSentence = v.Sentence != null && v.Sentence != "",
                totalReviews = v.TotalReviews,
            })
            .ToListAsync(ct);

        return ToolJson.Result(new { count = words.Count, words });
    }
}
