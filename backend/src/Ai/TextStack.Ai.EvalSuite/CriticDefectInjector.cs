using Application.Agents;

namespace TextStack.Ai.EvalSuite;

/// <summary>
/// Pure, deterministic defect injection for the synthetic-defect harness (AI-044). Each transform takes a
/// KNOWN-clean draft and a <see cref="ContentBrief"/> (for the real length bounds + banned list) and returns
/// a draft carrying exactly ONE known defect — no LLM, no randomness, so the same golden always produces the
/// same injected text and the harness is fully reproducible/CI-testable. <c>clean</c> returns the draft
/// untouched (the false-positive control). The defect taxonomy mirrors the four critic axes plus an over/under
/// length split.
/// </summary>
public static class CriticDefectInjector
{
    /// <summary>The defect-type discriminators used by the golden set + injector switch.</summary>
    public const string FactualHallucination = "factual_hallucination";
    public const string BannedPhrase = "banned_phrase";
    public const string LengthOver = "length_over";
    public const string LengthUnder = "length_under";
    public const string ToneBreak = "tone_break";
    public const string Clean = "clean";

    /// <summary>
    /// Applies the golden's defect transform to its clean draft. Throws on an unknown defect type
    /// (golden-authoring bug — fail loud, this is build-time data, not model output).
    /// </summary>
    public static string Inject(CriticDefectGolden golden, ContentBrief brief) => golden.DefectType switch
    {
        FactualHallucination => InjectFactual(golden.CleanDraft, golden.InjectionParam),
        BannedPhrase => InjectBannedPhrase(golden.CleanDraft, golden.InjectionParam, brief),
        LengthOver => InjectLengthOver(golden.CleanDraft, brief.MaxLength),
        LengthUnder => InjectLengthUnder(golden.CleanDraft, brief.MinLength),
        ToneBreak => InjectToneBreak(golden.CleanDraft, golden.InjectionParam),
        Clean => golden.CleanDraft,
        _ => throw new ArgumentOutOfRangeException(
            nameof(golden), golden.DefectType, "Unknown defect type in critic-defect golden."),
    };

    /// <summary>Appends a fabricated sentence (an invented fact absent from the research notes).</summary>
    private static string InjectFactual(string draft, string? fabricated)
    {
        var sentence = Require(fabricated, FactualHallucination);
        return $"{draft.TrimEnd()} {sentence.Trim()}";
    }

    /// <summary>Splices a banned phrase from the brief's blocklist into the draft as a superlative aside.</summary>
    private static string InjectBannedPhrase(string draft, string? phrase, ContentBrief brief)
    {
        var banned = Require(phrase, BannedPhrase);
        if (!brief.BannedPhrases.Contains(banned, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException(
                $"banned_phrase golden '{banned}' is not in the brief's blocklist.", nameof(phrase));
        // Embed mid-prose so it reads as the drafter slipping, not an appended tag.
        return $"{draft.TrimEnd()} It is widely regarded as a {banned}.";
    }

    /// <summary>
    /// Pads the draft well PAST <paramref name="maxLength"/> (target ≈ maxLength + 50%) so the over-length
    /// breach is unmistakable — an LLM eyeballing the prose can't miss a draft this far over the bound, unlike
    /// a 1–2% overshoot that's within the noise of a character count.
    /// </summary>
    private static string InjectLengthOver(string draft, int maxLength)
    {
        const string filler =
            " The work has been studied extensively across many editions and scholarly commentaries.";
        var target = maxLength + maxLength / 2; // ~1.5× MaxLength (e.g. 1600 → ~2400 before final clause)
        var padded = draft.TrimEnd();
        while (padded.Length <= target)
            padded += filler;
        return padded;
    }

    /// <summary>
    /// Truncates the draft to roughly HALF <paramref name="minLength"/> (on a word boundary when possible) so
    /// the under-length breach is unmistakable — a draft at ~50% of the floor is plainly too short, unlike a
    /// few-character shortfall that a nano critic can't reliably catch.
    /// </summary>
    private static string InjectLengthUnder(string draft, int minLength)
    {
        var target = Math.Max(0, minLength / 2); // ~50% of MinLength (e.g. 800 → ~400 chars)
        if (draft.Length <= target)
            return draft; // already well short — leave as-is (golden should supply a long clean draft)

        var cut = draft[..target];
        var lastSpace = cut.LastIndexOf(' ');
        if (lastSpace > 0)
            cut = cut[..lastSpace];
        return cut.TrimEnd();
    }

    /// <summary>Injects a first-person / casual marketing aside that breaks the neutral encyclopedic tone.</summary>
    private static string InjectToneBreak(string draft, string? aside)
    {
        var note = Require(aside, ToneBreak);
        return $"{draft.TrimEnd()} {note.Trim()}";
    }

    private static string Require(string? param, string defectType) =>
        string.IsNullOrWhiteSpace(param)
            ? throw new ArgumentException($"{defectType} golden requires a non-empty InjectionParam.")
            : param;
}
