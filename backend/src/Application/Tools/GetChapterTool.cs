using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Phase 5 starter tool (AI-030): fetches one chapter of the context edition by number, so the LLM can
/// pull surrounding context ("see chapter 3", "as discussed earlier"). Text is truncated to keep one
/// call inside the prompt budget. Stateless singleton — the scoped db arrives via
/// <see cref="ToolContext.Services"/> at invoke time.
/// </summary>
public sealed class GetChapterTool : ITool
{
    /// <summary>Cap on returned chapter text — enough for context, small enough for the prompt.</summary>
    public const int MaxChars = 4000;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "chapter_number": {
              "type": "integer",
              "minimum": 1,
              "description": "1-based chapter number within the current book"
            }
          },
          "required": ["chapter_number"],
          "additionalProperties": false
        }
        """);

    public string Name => "get_chapter";

    public string Description =>
        "Fetch a chapter of the current book by its number (1-based). " +
        "Use when the text references another chapter or earlier discussion.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.EditionId is not { } editionId)
            throw new InvalidOperationException("No edition in context — get_chapter needs a current book.");

        var number = ToolJson.GetInt(args, "chapter_number")!.Value; // shape guaranteed by schema validation

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var chapter = await db.Chapters
            .Where(c => c.EditionId == editionId && c.ChapterNumber == number)
            .Select(c => new { c.ChapterNumber, c.Title, c.PlainText })
            .FirstOrDefaultAsync(ct);

        if (chapter is null)
            return ToolJson.Result(new { found = false, message = $"Chapter {number} does not exist in this book." });

        var (text, truncated) = ToolJson.Truncate(chapter.PlainText, MaxChars);
        return ToolJson.Result(new { found = true, chapterNumber = chapter.ChapterNumber, title = chapter.Title, text, truncated });
    }
}
