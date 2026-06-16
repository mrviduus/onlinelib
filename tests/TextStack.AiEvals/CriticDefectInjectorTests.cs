using Application.Agents;
using TextStack.Ai.EvalSuite;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for the AI-044 synthetic-defect injector: each transform must produce the KNOWN
/// defect it claims (length actually out of bounds, banned phrase actually present, fabricated fact actually
/// appended + absent from notes), and clean controls must stay untouched + in-bounds. No LLM, no key — this
/// is the unit under test in the deterministic half of the harness.
/// </summary>
public class CriticDefectInjectorTests
{
    private static readonly ContentBrief Brief = AutoPublishBriefs.Description("en");
    private static readonly IReadOnlyList<CriticDefectGolden> Goldens = CriticDefectGoldenSet.Load();

    private static CriticDefectGolden ByType(string type) =>
        Goldens.First(g => g.DefectType == type);

    [Fact]
    public void Inject_LengthOver_OvershootsMaxLengthByWideMargin()
    {
        var g = ByType(CriticDefectInjector.LengthOver);
        var injected = CriticDefectInjector.Inject(g, Brief);

        // Unmistakably long: at least ~1.4× MaxLength, so a nano critic can't miss the breach.
        Assert.True(injected.Length > Brief.MaxLength + (Brief.MaxLength * 4 / 10),
            $"length_over must overshoot MaxLength={Brief.MaxLength} by a wide margin; got {injected.Length}");
    }

    [Fact]
    public void Inject_LengthUnder_UndershootsMinLengthByWideMargin()
    {
        var g = ByType(CriticDefectInjector.LengthUnder);
        var injected = CriticDefectInjector.Inject(g, Brief);

        // Unmistakably short: at or below ~half MinLength, so the breach is obvious, not a few-char shortfall.
        Assert.True(injected.Length <= Brief.MinLength / 2,
            $"length_under must undershoot MinLength={Brief.MinLength} by a wide margin; got {injected.Length}");
    }

    [Fact]
    public void Inject_BannedPhrase_PhraseSubstringPresent()
    {
        var g = ByType(CriticDefectInjector.BannedPhrase);
        var injected = CriticDefectInjector.Inject(g, Brief);

        Assert.Contains(g.InjectionParam!, injected, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(g.InjectionParam!, Brief.BannedPhrases, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain(g.InjectionParam!, g.CleanDraft, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Inject_FactualHallucination_AppendsFabricatedSentenceAbsentFromNotes()
    {
        var g = ByType(CriticDefectInjector.FactualHallucination);
        var injected = CriticDefectInjector.Inject(g, Brief);

        Assert.Contains(g.InjectionParam!.Trim(), injected, StringComparison.Ordinal);
        Assert.EndsWith(g.InjectionParam!.Trim(), injected, StringComparison.Ordinal);
        Assert.StartsWith(g.CleanDraft.TrimEnd()[..40], injected, StringComparison.Ordinal);
        // The fabricated fact must NOT be grounded in the research notes (that's what makes it a hallucination).
        Assert.DoesNotContain(g.InjectionParam!.Trim(), g.ResearchNotes, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Inject_ToneBreak_InjectsCasualAside()
    {
        var g = ByType(CriticDefectInjector.ToneBreak);
        var injected = CriticDefectInjector.Inject(g, Brief);

        Assert.Contains(g.InjectionParam!.Trim(), injected, StringComparison.Ordinal);
        Assert.NotEqual(g.CleanDraft, injected);
    }

    [Fact]
    public void Inject_Clean_ReturnsDraftUnchangedAndWithinBounds()
    {
        foreach (var g in Goldens.Where(x => x.DefectType == CriticDefectInjector.Clean))
        {
            var injected = CriticDefectInjector.Inject(g, Brief);

            Assert.Equal(g.CleanDraft, injected); // controls must be untouched
            Assert.True(injected.Length >= Brief.MinLength && injected.Length <= Brief.MaxLength,
                $"clean control {g.Id} must be in [{Brief.MinLength},{Brief.MaxLength}]; got {injected.Length}");
        }
    }

    [Fact]
    public void Inject_IsDeterministic_SameInputSameOutput()
    {
        foreach (var g in Goldens)
            Assert.Equal(CriticDefectInjector.Inject(g, Brief), CriticDefectInjector.Inject(g, Brief));
    }

    [Fact]
    public void GoldenSet_HasExpectedTaxonomyShape()
    {
        // ~23 fixtures: 6 factual, 4 banned, 2 over + 2 under length, 4 tone, 5 clean.
        Assert.Equal(23, Goldens.Count);
        Assert.Equal(6, Goldens.Count(g => g.DefectType == CriticDefectInjector.FactualHallucination));
        Assert.Equal(4, Goldens.Count(g => g.DefectType == CriticDefectInjector.BannedPhrase));
        Assert.Equal(2, Goldens.Count(g => g.DefectType == CriticDefectInjector.LengthOver));
        Assert.Equal(2, Goldens.Count(g => g.DefectType == CriticDefectInjector.LengthUnder));
        Assert.Equal(4, Goldens.Count(g => g.DefectType == CriticDefectInjector.ToneBreak));
        Assert.Equal(5, Goldens.Count(g => g.DefectType == CriticDefectInjector.Clean));

        // Defects carry an expected axis; clean controls do not. Ids are unique.
        Assert.All(Goldens.Where(g => g.DefectType != CriticDefectInjector.Clean),
            g => Assert.False(string.IsNullOrWhiteSpace(g.ExpectedAxis)));
        Assert.All(Goldens.Where(g => g.DefectType == CriticDefectInjector.Clean),
            g => Assert.Null(g.ExpectedAxis));
        Assert.Equal(Goldens.Count, Goldens.Select(g => g.Id).Distinct().Count());
    }

    [Fact]
    public void GoldenSet_EveryExpectedAxis_IsAKnownScorableAxis()
    {
        // Guards a golden-authoring typo: an unknown ExpectedAxis (e.g. "facutal_accuracy") makes the runner's
        // AxisScore fall through to a benign 5 and the keyword fallback return false, so that defect could NEVER
        // be caught — silently deflating catch-rate. Axes must match CriticDefectEvalRunner's four consts.
        var knownAxes = new[] { "factual_accuracy", "tone", "length", "banned_phrases" };
        Assert.All(Goldens.Where(g => g.ExpectedAxis is not null),
            g => Assert.Contains(g.ExpectedAxis, knownAxes));
    }
}
