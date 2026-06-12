using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Phase 5 starter tool (AI-030): the invoking user's highlights (with inline notes) for the current
/// book, optionally filtered by a substring — so the model can ground an explanation in what the user
/// already marked. Strictly scoped to <see cref="ToolContext.UserId"/>; capped to protect the prompt.
/// </summary>
public sealed class GetUserHighlightsTool : ITool
{
    public const int DefaultLimit = 10;
    public const int MaxLimit = 20;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "minLength": 2,
              "maxLength": 200,
              "description": "Optional substring to filter highlights by (matches the highlighted text or its note)"
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 20,
              "description": "Max highlights to return (default 10)"
            }
          },
          "additionalProperties": false
        }
        """);

    public string Name => "get_user_highlights";

    public string Description =>
        "Fetch the user's own highlights and notes for the current book, optionally filtered by a phrase. " +
        "Use when the user may have already marked or annotated the concept being explained.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.UserId is not { } userId)
            throw new InvalidOperationException("No user in context — get_user_highlights needs a signed-in user.");
        if (ctx.EditionId is not { } editionId)
            throw new InvalidOperationException("No edition in context — get_user_highlights needs a current book.");

        var query = ToolJson.GetString(args, "query");
        var limit = Math.Clamp(ToolJson.GetInt(args, "limit") ?? DefaultLimit, 1, MaxLimit);

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var rows = db.Highlights
            .Where(h => h.UserId == userId && h.EditionId == editionId && h.ChapterId != null);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var pattern = $"%{query.Trim()}%";
            rows = rows.Where(h =>
                EF.Functions.ILike(h.SelectedText, pattern) ||
                (h.NoteText != null && EF.Functions.ILike(h.NoteText, pattern)));
        }

        var highlights = await rows
            .OrderBy(h => h.Chapter!.ChapterNumber).ThenBy(h => h.CreatedAt)
            .Take(limit)
            .Select(h => new { chapterNumber = h.Chapter!.ChapterNumber, text = h.SelectedText, note = h.NoteText })
            .ToListAsync(ct);

        return ToolJson.Result(new { count = highlights.Count, highlights });
    }
}
