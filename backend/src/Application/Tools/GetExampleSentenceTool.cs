using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;

namespace Application.Tools;

/// <summary>
/// Tutor agent tool (AI-Agent-2): a REAL in-context sentence for a vocabulary card, pulled from a book the
/// learner has actually read — the thesis anchor that keeps exercises grounded in real reading rather than
/// invented. Resolves the card by id (scoped to <see cref="ToolContext.UserId"/>), prefers the sentence
/// captured when the word was saved, and otherwise retrieves one via the spoiler-gated RAG over the card's
/// source book (catalog edition or the learner's own upload). "Not found" is data, never an error.
/// </summary>
public sealed class GetExampleSentenceTool : ITool
{
    private const int SnippetChars = 400;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "wordId": {
              "type": "string",
              "description": "The vocabulary card id (from get_due_vocabulary / get_weak_vocabulary) to find a sentence for"
            }
          },
          "required": ["wordId"],
          "additionalProperties": false
        }
        """);

    public string Name => "get_example_sentence";

    public string Description =>
        "Fetch a real example sentence for a vocabulary card from a book the learner has read (its saved " +
        "sentence, or one retrieved from the source book). Use to ground a context exercise — especially on a " +
        "word the learner missed — in their actual reading instead of an invented sentence.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.UserId is not { } userId)
            throw new InvalidOperationException("No user in context — get_example_sentence needs a signed-in user.");

        if (ToolJson.GetString(args, "wordId") is not { } raw || !Guid.TryParse(raw, out var wordId))
            return ToolJson.Result(new { found = false, message = "wordId is not a valid id." });

        var db = ctx.Services.GetRequiredService<IAppDbContext>();
        var card = await db.VocabularyWords
            .Where(v => v.Id == wordId && v.UserId == userId)
            .Select(v => new { v.Word, v.Sentence, v.EditionId, v.UserBookId, v.BookTitle })
            .FirstOrDefaultAsync(ct);

        if (card is null)
            return ToolJson.Result(new { found = false, wordId = raw, message = "Card not found for this user." });

        // 1) The sentence captured at save time is the cheapest, most faithful in-context example.
        if (!string.IsNullOrWhiteSpace(card.Sentence))
        {
            // Sentences can come from user-uploaded books — treat as untrusted DATA: strip injection vectors
            // before this text reaches the planner prompt as a tool observation, then cap length.
            var clean = ExternalTextSanitizer.Clean(card.Sentence);
            if (!string.IsNullOrWhiteSpace(clean))
            {
                var (snippet, truncated) = ToolJson.Truncate(clean.Trim(), SnippetChars);
                return ToolJson.Result(new
                {
                    found = true,
                    wordId = raw,
                    word = card.Word,
                    sentence = snippet,
                    truncated,
                    source = "saved",
                    // Cleaned like every other free-text field here, and it was the one that was
                    // not. A user-uploaded book's title is user-controlled and lands in the
                    // planner prompt as a tool observation; GetReadingContextTool sanitizes titles
                    // for exactly this reason, in a comment that says to treat them as data and
                    // never as instructions. The defence existed; this field was outside it.
                    bookTitle = ExternalTextSanitizer.Clean(card.BookTitle),
                });
            }
        }

        // 2) Fall back to retrieving a sentence from the card's source book via the spoiler-gated RAG, so the
        // example still comes from the learner's own reading. Degrade as data if the book isn't indexed / RAG
        // is unavailable on this host.
        var rag = ctx.Services.GetService<IRagService>();
        if (rag is not null)
        {
            try
            {
                IReadOnlyList<RetrievedChunk> chunks = [];
                if (card.UserBookId is { } userBookId)
                {
                    chunks = await rag.RetrieveUserBookAsync(userId, userBookId, card.Word, 1, maxChapterOrd: null, SummarySpec.None, ct);
                }
                else if (card.EditionId is { } editionId)
                {
                    var gate = await ReadingProgressGate.ResolveLastReadOrdAsync(db, userId, editionId, ct);
                    chunks = await rag.RetrieveAsync(editionId, card.Word, 1, maxChapterOrd: gate, SummarySpec.None, ct);
                }

                var top = chunks.FirstOrDefault();
                if (top.Text is { Length: > 0 } text)
                {
                    // RAG text comes straight out of the book (incl. user uploads) — sanitize before it enters
                    // the planner prompt as DATA, then cap length.
                    var clean = ExternalTextSanitizer.Clean(text);
                    if (!string.IsNullOrWhiteSpace(clean))
                    {
                        var (snippet, truncated) = ToolJson.Truncate(clean.Trim(), SnippetChars);
                        return ToolJson.Result(new
                        {
                            found = true,
                            wordId = raw,
                            word = card.Word,
                            sentence = snippet,
                            truncated,
                            source = "rag",
                            bookTitle = ExternalTextSanitizer.Clean(card.BookTitle),
                        });
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Retrieval failure is data, not a crash — the agent can still plan without an example.
                return ToolJson.Result(new { found = false, wordId = raw, word = card.Word, message = "Retrieval unavailable." });
            }
        }

        return ToolJson.Result(new { found = false, wordId = raw, word = card.Word, message = "No example sentence available." });
    }
}
