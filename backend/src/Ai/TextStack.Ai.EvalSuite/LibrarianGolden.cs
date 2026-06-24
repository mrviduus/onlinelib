namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One Librarian-agent golden (AI-Agent-3): a natural-language catalog <see cref="Query"/> plus the set of
/// catalog <see cref="ExpectedSlugs"/> that SHOULD surface for it (the relevance set the recall metric scores
/// against). <see cref="NeedsExternal"/> marks queries whose intent is genuinely outside the seeded library, so
/// the agent is EXPECTED to expand to Open Library — coverage-decision accuracy checks it did. Optional
/// <see cref="MaxPages"/>/<see cref="Language"/> are the constraints the agent must honor; constraint-satisfaction
/// checks every returned library book respects them.
/// </summary>
public record LibrarianGolden(
    string Query,
    IReadOnlyList<string> ExpectedSlugs,
    bool NeedsExternal = false,
    int? MaxPages = null,
    string? Language = null);
