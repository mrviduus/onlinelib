namespace Application.Agents;

/// <summary>
/// The shared writing assignment threaded through a content crew (Phase 7, AI-041). Every specialist reads
/// the SAME brief so the constraints (length, banned phrases, language, style) are enforced identically by
/// drafter, critic and editor — there is no drift between "write to N chars" and "score length against N".
/// Lengths are in CHARACTERS (SEO fields are character-bounded, not token-bounded).
/// </summary>
public record ContentBrief(
    string EntityType,
    string FieldName,
    int MinLength,
    int MaxLength,
    IReadOnlyList<string> BannedPhrases,
    string TargetLanguage,
    string? StyleGuide);

/// <summary>Input to the researcher: the brief plus the raw source material to condense into neutral facts.</summary>
public record ResearchInput(ContentBrief Brief, string SourceMaterial);

/// <summary>The researcher's output: bullet FACTS grounded entirely in the source, ready for the drafter.</summary>
public record ResearchNotes(string Notes);

/// <summary>Input to the drafter: the brief plus the research notes it must write strictly from.</summary>
public record DraftInput(ContentBrief Brief, ResearchNotes Research);

/// <summary>A produced draft of the requested field.</summary>
public record Draft(string Text);

/// <summary>Input to the critic: the brief, the draft to score, and the research notes to ground it against.</summary>
public record CritiqueInput(ContentBrief Brief, Draft Draft, ResearchNotes Research);

/// <summary>Input to the editor: the brief, the draft to revise, and the critique listing what to fix.</summary>
public record EditInput(ContentBrief Brief, Draft Draft, CritiqueResult Critique);

/// <summary>
/// The critic's structured verdict: 1-5 scores on each axis plus an issue list. <see cref="ParseFailed"/> is
/// true when the critic's output could not be parsed (fail-closed all-1s) — callers treat that as "reject,
/// needs work", never as a clean pass.
/// </summary>
public record CritiqueResult(
    int FactualAccuracy,
    int Tone,
    int Length,
    int BannedPhrases,
    IReadOnlyList<CritiqueIssue> Issues,
    bool ParseFailed);

/// <summary>One actionable defect the critic found. <c>Severity</c> is one of "blocker", "major", "minor".</summary>
public record CritiqueIssue(string Location, string Severity, string Fix);
