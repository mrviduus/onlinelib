using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;

namespace Application.Tools;

/// <summary>
/// Phase 5 starter tool (AI-030): searches the current book via the production hybrid retrieval
/// (vector + lexical + RRF, AI-023) and returns the top passages with their chapter numbers. When the
/// invoking user has reading progress, results are spoiler-gated to their furthest-read chapter (same
/// high-water mark as RAG); without progress the search is ungated — the Explain flow targets text the
/// user is actively looking at.
/// </summary>
public sealed class SearchBookTool : ITool
{
    public const int TopK = 5;

    /// <summary>Snippet cap per passage — five of these stay comfortably inside the prompt budget.</summary>
    public const int SnippetChars = 400;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "minLength": 2,
              "maxLength": 300,
              "description": "What to look for in the book (a phrase, term, or question)"
            }
          },
          "required": ["query"],
          "additionalProperties": false
        }
        """);

    public string Name => "search_book";

    public string Description =>
        "Search the current book for passages relevant to a phrase or question. " +
        "Use when the explanation needs where/how the book discusses something.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.EditionId is not { } editionId)
            throw new InvalidOperationException("No edition in context — search_book needs a current book.");

        var query = ToolJson.GetString(args, "query")!; // shape guaranteed by schema validation

        var rag = ctx.Services.GetRequiredService<IRagService>();
        var gate = ctx.UserId is { } userId
            ? await ReadingProgressGate.ResolveLastReadOrdAsync(ctx.Services.GetRequiredService<IAppDbContext>(), userId, editionId, ct)
            : null;

        var chunks = await rag.RetrieveAsync(editionId, query, TopK, maxChapterOrd: gate, ct);

        var passages = chunks.Select(c =>
        {
            var (snippet, truncated) = ToolJson.Truncate(c.Text, SnippetChars);
            return new { chapterNumber = c.ChapterOrd, snippet, truncated };
        }).ToList();

        return ToolJson.Result(new { query, passages });
    }
}
