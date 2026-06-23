namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One Enrichment-agent golden (AI-Agent-1). Extends the <see cref="BookMetaGolden"/> idea with a
/// <see cref="Difficulty"/> band so the headline metric — <i>calibration of honest unknowns</i> — can be
/// scored: the agent SHOULD be confident-and-right on <c>canonical</c> classics, SHOULD use tools on
/// <c>ambiguous</c> works, and SHOULD say "unknown" on <c>unknown</c> ones rather than hallucinate.
/// A null <see cref="ExpectedYear"/> or empty <see cref="ExpectedGenre"/> on the <c>unknown</c> band marks
/// an abstain-target (the agent is rewarded for returning null there, penalized for guessing). On a
/// <c>canonical</c>/<c>ambiguous</c> golden a null <see cref="ExpectedYear"/> instead means the year is
/// genuinely INDETERMINATE (e.g. "The Republic", a BC date) — there the year must NOT be scored at all, so
/// a correct confident answer isn't punished. Set <see cref="ScoreYear"/> = false to opt that golden's year
/// out of both accuracy and calibration scoring.
/// </summary>
public record EnrichmentGolden(
    string Title,
    string? Author,
    string? ExpectedGenre,
    int? ExpectedYear,
    string Difficulty,
    bool ScoreYear = true)
{
    /// <summary>
    /// True when committing a YEAR on this golden should count toward calibration. The year is scorable
    /// when it carries a ground-truth year (<see cref="ExpectedYear"/> set) OR it is an abstain-target (the
    /// <c>unknown</c> band, where any committed year is a miscalibration). It is NOT scorable when the year
    /// is genuinely indeterminate — an explicit <see cref="ScoreYear"/> = false, or a non-unknown golden with
    /// a null <see cref="ExpectedYear"/>.
    /// </summary>
    public bool YearIsScorable =>
        ScoreYear
        && (ExpectedYear is not null || Difficulty == EnrichmentDifficulty.Unknown);
}

/// <summary>The three difficulty bands an <see cref="EnrichmentGolden"/> can carry.</summary>
public static class EnrichmentDifficulty
{
    public const string Canonical = "canonical";   // famous → agent should one-shot, high confidence
    public const string Ambiguous = "ambiguous";   // obscure/ambiguous → agent should use tools
    public const string Unknown = "unknown";       // genuinely unknowable → agent should say "unknown"
}
