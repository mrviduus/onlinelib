using Application.Ai;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>The reader's request: a confusing passage to explain, with its book/chapter for context.</summary>
public record StudyBuddyInput(string Passage, Guid EditionId, int? ChapterNumber);

/// <summary>
/// The Study Buddy agent (Phase 6, AI-035): in the reader, a user highlights a confusing paragraph and
/// asks for help; this agent investigates with tools (chapter context, in-book search, where a term was
/// first defined, the user's own vocabulary/highlights) and writes a short grounded explanation. A thin
/// concrete layer over the generic <see cref="AgentLoop"/> — it owns only the system prompt, the allowed
/// tool set, and the run budget; the plan→act→observe mechanics live in the loop.
/// </summary>
public sealed class StudyBuddyAgent(AgentLoop loop) : IAgent<StudyBuddyInput, string>
{
    public const string FeatureTag = "studybuddy";

    /// <summary>Bounded per the playbook: ≤6 iterations, a per-step token budget, and a per-run cost cap.</summary>
    private static readonly AgentLoopOptions Options = new(MaxSteps: 6, MaxTokensPerStep: 1024, CostCapUsd: 0.05m);

    public Task<AgentResult<string>> RunAsync(StudyBuddyInput input, AgentContext ctx, CancellationToken ct) =>
        loop.RunAsync(BuildAgentInput(input, ctx), ctx, Options, ct);

    /// <summary>Streams the run step-by-step (AI-037a) for the SSE endpoint — same config as <see cref="RunAsync"/>.</summary>
    public IAsyncEnumerable<AgentEvent> StreamAsync(StudyBuddyInput input, AgentContext ctx, CancellationToken ct) =>
        loop.StreamAsync(BuildAgentInput(input, ctx), ctx, Options, ct);

    /// <summary>
    /// Deterministic per-run tool gate (AI-039): the same insight as the Explain pre-router (AI-033),
    /// generalized to the agent. Which tools are OFFERED depends ONLY on the passage's lexical signals —
    /// a self-contained passage gets no tools (so the model answers in one step and cannot over-call),
    /// while a passage that genuinely references a numbered chapter, an earlier discussion, or the
    /// reader's own highlights gets the matching tools and the loop runs normally. The highlights/vocab
    /// pair additionally requires a signed-in user.
    /// </summary>
    private static IReadOnlyList<string> ResolveTools(StudyBuddyInput input, AgentContext ctx)
    {
        var signal = BookToolTriggers.Detect(input.Passage);
        var tools = new List<string>();
        if (signal.HasFlag(BookToolSignal.ChapterNumber))
        {
            tools.Add("get_chapter");
            tools.Add("get_chapter_summary");
        }
        if (signal.HasFlag(BookToolSignal.EarlierReference))
        {
            tools.Add("search_book");
            tools.Add("find_earlier_definition");
        }
        if (signal.HasFlag(BookToolSignal.UserHighlights) && ctx.UserId is not null)
        {
            tools.Add("get_user_highlights");
            tools.Add("get_user_vocabulary");
        }
        return tools;
    }

    private static AgentInput BuildAgentInput(StudyBuddyInput input, AgentContext ctx) =>
        new(UserGoal: BuildGoal(input), SystemPrompt: SystemPrompt,
            AllowedTools: ResolveTools(input, ctx), FeatureTag: FeatureTag);

    private static string BuildGoal(StudyBuddyInput input)
    {
        var where = input.ChapterNumber is { } n ? $" (Chapter {n})" : string.Empty;
        return $"Help me understand this confusing passage{where}:\n\n{input.Passage}";
    }

    public const string SystemPrompt =
        "You are a study buddy for a developer reading a technical book. " +
        "Goal: help them understand a confusing passage.\n" +
        "Whether to call a tool depends ONLY on the passage's wording: it explicitly names a chapter " +
        "number, says something was \"discussed/mentioned earlier\", or refers to the reader's own " +
        "\"highlights/notes\". When the wording points outside the passage like that, use the matching " +
        "tool to fetch it. A term simply being technical, unfamiliar, or hard is NEVER by itself a reason " +
        "to call a tool. If the passage has none of those references, answer directly from the passage " +
        "itself in a single step — do not call any tool.\n" +
        "Write a clear 3-5 sentence explanation in plain language, connecting it to where concepts were " +
        "defined earlier when relevant. " +
        "Never invent facts that are not in the tool results or the passage itself. " +
        "No preface, no markdown headings.";
}
