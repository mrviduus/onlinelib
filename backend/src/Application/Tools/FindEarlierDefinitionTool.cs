using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;

namespace Application.Tools;

/// <summary>
/// Study Buddy tool (AI-035): find where a term was introduced EARLIER in the book — the passage from
/// the lowest-numbered chapter that discusses it — so the agent can explain a confusing passage by
/// pointing back to where the concept was first defined. Built on the production hybrid retrieval
/// (AI-023); spoiler-gated to the reader's furthest-read chapter when they have progress.
/// </summary>
public sealed class FindEarlierDefinitionTool : ITool
{
    /// <summary>Candidates to retrieve before picking the earliest — enough to look past a single near-duplicate.</summary>
    private const int CandidatePool = 8;
    private const int SnippetChars = 500;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "term": {
              "type": "string",
              "minLength": 2,
              "maxLength": 100,
              "description": "The term or concept to locate the earliest discussion of"
            }
          },
          "required": ["term"],
          "additionalProperties": false
        }
        """);

    public string Name => "find_earlier_definition";

    public string Description =>
        "Find where a term or concept was first introduced earlier in the current book, returning that " +
        "passage and its chapter. Use when a passage assumes a concept the reader may have forgotten.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.EditionId is not { } editionId)
            throw new InvalidOperationException("No edition in context — find_earlier_definition needs a current book.");

        var term = ToolJson.GetString(args, "term")!; // shape guaranteed by schema validation

        var rag = ctx.Services.GetRequiredService<IRagService>();
        var gate = ctx.UserId is { } userId
            ? await ReadingProgressGate.ResolveLastReadOrdAsync(ctx.Services.GetRequiredService<IAppDbContext>(), userId, editionId, ct)
            : null;

        var chunks = await rag.RetrieveAsync(editionId, term, CandidatePool, maxChapterOrd: gate, ct);
        // "Earlier" = the lowest-numbered chapter that matched (where the concept first appears).
        var earliest = chunks.OrderBy(c => c.ChapterOrd).ThenBy(c => c.Ord).FirstOrDefault();

        if (earliest.Text is null or "")
            return ToolJson.Result(new { found = false, term, message = $"No earlier discussion of '{term}' found." });

        var (snippet, truncated) = ToolJson.Truncate(earliest.Text, SnippetChars);
        return ToolJson.Result(new
        {
            found = true,
            term,
            chapterNumber = earliest.ChapterOrd,
            snippet,
            truncated,
        });
    }
}
