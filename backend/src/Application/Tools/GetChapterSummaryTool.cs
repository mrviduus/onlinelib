using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Study Buddy tool (AI-035): a cheap, deterministic "what is this chapter about" snapshot — title,
/// word count, and the chapter's opening — so the agent can orient a passage without paying to pull
/// (and the model paying to read) the whole chapter via get_chapter. NOT an LLM-generated summary;
/// the opening of a well-structured technical chapter states its subject, which is enough to orient.
/// </summary>
public sealed class GetChapterSummaryTool : ITool
{
    /// <summary>How much of the chapter opening to return — enough to convey the subject, small for the prompt.</summary>
    public const int OpeningChars = 800;

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

    public string Name => "get_chapter_summary";

    public string Description =>
        "Get a quick orientation for a chapter of the current book: its title, length, and opening lines. " +
        "Use to see what a chapter is about before deciding whether to read it in full with get_chapter.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.EditionId is not { } editionId)
            throw new InvalidOperationException("No edition in context — get_chapter_summary needs a current book.");

        var number = ToolJson.GetInt(args, "chapter_number")!.Value; // shape guaranteed by schema validation

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var chapter = await db.Chapters
            .Where(c => c.EditionId == editionId && c.ChapterNumber == number)
            .Select(c => new { c.ChapterNumber, c.OriginalChapterNumber, c.PartNumber, c.TotalParts, c.Title, c.PlainText, c.WordCount })
            .FirstOrDefaultAsync(ct);

        if (chapter is null)
            return ToolJson.Result(new { found = false, message = $"Chapter {number} does not exist in this book." });

        var (opening, truncated) = ToolJson.Truncate(chapter.PlainText, OpeningChars);
        return ToolJson.Result(new
        {
            found = true,
            chapter = ChapterLabel.For(chapter.ChapterNumber, chapter.OriginalChapterNumber, chapter.PartNumber, chapter.TotalParts),
            title = chapter.Title,
            wordCount = chapter.WordCount,
            opening,
            openingTruncated = truncated,
        });
    }
}
