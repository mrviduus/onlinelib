namespace Application.Agents;

/// <summary>
/// The shared superlative blocklist every in-process content crew enforces (Phase 7). Encodes the legacy
/// "no subjective superlatives" rule the SEO shell scripts hand their LLM as an explicit list the critic can
/// score a draft against. One place so AutoPublish (AI-042) and SEO (AI-043) briefs stay identical and there
/// is no per-crew drift between "write without these" and "block on these".
/// </summary>
public static class CrewBannedPhrases
{
    public static readonly IReadOnlyList<string> List =
    [
        "masterpiece",
        "must-read",
        "timeless classic",
        "page-turner",
        "tour de force",
        "magnum opus",
    ];
}
