using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;

namespace Application.Tools;

/// <summary>
/// Tutor agent tool (AI-Agent-2): the learner's RECENT reading — which books (catalog editions or their own
/// uploads), in what language, how recently — so practice stays tied to what they're actually reading (the
/// product thesis: fluency through reading). Wraps a <c>ReadingSession</c> query scoped to
/// <see cref="ToolContext.UserId"/>, newest first, de-duplicated per book, capped. Returns no card ids — it's
/// context only, never a grounding source for planned items.
/// </summary>
public sealed class GetReadingContextTool : ITool
{
    public const int DefaultDays = 14;
    public const int MaxDays = 90;
    public const int MaxBooks = 5;

    /// <summary>Cap on a book title before it enters the planner prompt (titles are untrusted external text).</summary>
    private const int MaxTitleChars = 200;

    private static readonly JsonElement Schema = ToolJson.Schema("""
        {
          "type": "object",
          "properties": {
            "days": {
              "type": "integer",
              "minimum": 1,
              "maximum": 90,
              "description": "Look-back window in days for recent reading (default 14)"
            }
          },
          "additionalProperties": false
        }
        """);

    public string Name => "get_reading_context";

    public string Description =>
        "Fetch the books the learner has read recently (title + language), most recent first. Use to keep the " +
        "study session anchored to what they're actually reading — favour words and example sentences from " +
        "these books over decontextualized drilling.";

    public JsonElement ArgsSchema => Schema;

    public async Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
    {
        if (ctx.UserId is not { } userId)
            throw new InvalidOperationException("No user in context — get_reading_context needs a signed-in user.");

        var days = Math.Clamp(ToolJson.GetInt(args, "days") ?? DefaultDays, 1, MaxDays);
        var since = DateTimeOffset.UtcNow.AddDays(-days);

        var db = ctx.Services.GetRequiredService<IAppDbContext>();

        // Most-recent session per book, joined to its title/language. Pull a small pool then group in memory —
        // the per-user recent-session set is tiny, and grouping-with-title needs the join either way.
        var sessions = await db.ReadingSessions
            .Where(s => s.UserId == userId && s.StartedAt >= since)
            .OrderByDescending(s => s.StartedAt)
            .Take(50)
            .Select(s => new { s.EditionId, s.UserBookId, s.StartedAt })
            .ToListAsync(ct);

        var books = new List<object>();
        var seen = new HashSet<string>();

        foreach (var s in sessions)
        {
            if (books.Count >= MaxBooks) break;

            string? title = null, language = null, source = null;
            if (s.EditionId is { } eid)
            {
                var ed = await db.Editions
                    .Where(e => e.Id == eid)
                    .Select(e => new { e.Title, e.Language })
                    .FirstOrDefaultAsync(ct);
                if (ed is not null) { title = ed.Title; language = ed.Language; source = "library"; }
            }
            else if (s.UserBookId is { } ubid)
            {
                // Defense-in-depth: every user-scoped query filters on user_id, even though ubid came from this
                // user's own ReadingSession (P2 isolation discipline).
                var ub = await db.UserBooks
                    .Where(b => b.Id == ubid && b.UserId == userId)
                    .Select(b => new { b.Title, b.Language })
                    .FirstOrDefaultAsync(ct);
                if (ub is not null) { title = ub.Title; language = ub.Language; source = "userbook"; }
            }

            if (title is null) continue;
            // Titles (esp. user-uploaded book titles) are untrusted external text — sanitize + cap before they
            // enter the planner prompt as a tool observation. Treat as DATA, never instructions.
            title = ExternalTextSanitizer.Clean(title);
            if (string.IsNullOrWhiteSpace(title)) continue;
            if (title.Length > MaxTitleChars) title = title[..MaxTitleChars];
            var key = $"{source}:{title}";
            if (!seen.Add(key)) continue;

            books.Add(new { title, language, source, lastReadAt = s.StartedAt });
        }

        return ToolJson.Result(new { count = books.Count, books });
    }
}
