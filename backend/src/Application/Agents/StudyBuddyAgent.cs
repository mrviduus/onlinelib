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

    /// <summary>The tools the agent may call — the AI-035 trio plus the relevant Phase 5 book tools.</summary>
    private static readonly IReadOnlyList<string> AllowedTools =
    [
        "get_chapter",
        "get_chapter_summary",
        "search_book",
        "find_earlier_definition",
        "get_user_vocabulary",
        "get_user_highlights",
    ];

    public Task<AgentResult<string>> RunAsync(StudyBuddyInput input, AgentContext ctx, CancellationToken ct)
    {
        var agentInput = new AgentInput(
            UserGoal: BuildGoal(input),
            SystemPrompt: SystemPrompt,
            AllowedTools: AllowedTools,
            FeatureTag: FeatureTag);

        return loop.RunAsync(agentInput, ctx, Options, ct);
    }

    private static string BuildGoal(StudyBuddyInput input)
    {
        var where = input.ChapterNumber is { } n ? $" (Chapter {n})" : string.Empty;
        return $"Help me understand this confusing passage{where}:\n\n{input.Passage}";
    }

    public const string SystemPrompt =
        "You are a study buddy for a developer reading a technical book. " +
        "Goal: help them understand a confusing passage in at most a few tool-using steps.\n" +
        "Use the tools to fetch context: the surrounding chapter, in-book search, where a term was first " +
        "introduced earlier, and the reader's own saved vocabulary and highlights. " +
        "Call a tool only when it would genuinely help; most passages need one or two lookups at most.\n" +
        "Once you have enough context, write a clear 3-5 sentence explanation in plain language, " +
        "connecting it to where concepts were defined earlier when relevant. " +
        "Never invent facts that are not in the tool results or the passage itself. " +
        "No preface, no markdown headings.";
}
