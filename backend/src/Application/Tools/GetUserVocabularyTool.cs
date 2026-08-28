using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Study Buddy tool (AI-035): the user's own saved vocabulary for the current book — word + its
/// definition/translation — so the agent can explain a passage using terms the user has already
/// chosen to learn, and connect new material to them. Strictly scoped to <see cref="ToolContext.UserId"/>,
/// optionally substring-filtered, capped to protect the prompt.
/// </summary>
public sealed class GetUserVocabularyTool : ITool
{
    public const int DefaultLimit = 15;
    public const int MaxLimit = 30;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "minLength": 2,
              "maxLength": 100,
              "description": "Optional substring to filter the user's saved words by (matches word/definition/translation)"
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 30,
              "description": "Max words to return (default 15)"
            }
          },
          "additionalProperties": false
        }
        """);

    public string Name => "get_user_vocabulary";

    public string Description =>
        "Fetch the user's own saved vocabulary words for the current book (word + definition/translation), " +
        "optionally filtered by a phrase. Use to ground the explanation in terms the user is already learning.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.UserId is not { } userId)
            throw new InvalidOperationException("No user in context — get_user_vocabulary needs a signed-in user.");

        var query = ToolJson.GetString(args, "query");
        var limit = Math.Clamp(ToolJson.GetInt(args, "limit") ?? DefaultLimit, 1, MaxLimit);

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var rows = db.VocabularyWords.Where(v => v.UserId == userId);
        if (ctx.EditionId is { } editionId)
            rows = rows.Where(v => v.EditionId == editionId);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var pattern = $"%{query.Trim()}%";
            rows = rows.Where(v =>
                EF.Functions.ILike(v.Word, pattern) ||
                (v.Definition != null && EF.Functions.ILike(v.Definition, pattern)) ||
                (v.Translation != null && EF.Functions.ILike(v.Translation, pattern)));
        }

        var words = await rows
            .OrderByDescending(v => v.Stage).ThenBy(v => v.Word)
            .Take(limit + 1)
            .Select(v => new { word = v.Word, definition = v.Definition, translation = v.Translation })
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
