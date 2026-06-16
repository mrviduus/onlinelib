using System.Text.Json;
using Application.Agents;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="CriticDefectEvalRunner"/> (AI-044) with a FAKE critic: the runner
/// injects each golden defect, runs the real <see cref="CriticAgent"/> over a canned <see cref="ILlmService"/>,
/// and scores catch-rate + false-positive-rate purely. No key, no network. A "catches-all" critic (all 1s) →
/// catch-rate 1.0 + FP 1.0; "catches-none" (all 5s, no issues) → 0.0/0.0; a realistic mixed critic → the
/// catch-rate its detections imply. Also asserts BreakdownJson shape + EvalRun persistence.
/// </summary>
public class CriticDefectEvalRunnerTests
{
    private static readonly IReadOnlyList<CriticDefectGolden> Goldens = CriticDefectGoldenSet.Load();
    private static readonly ContentBrief Brief = AutoPublishBriefs.Description("en");

    private static CriticDefectEvalRunner Runner() =>
        new(NullLogger<CriticDefectEvalRunner>.Instance);

    private static CriticAgent Critic(ILlmService llm) => new(llm);

    /// <summary>Base fake: emits a critic JSON verdict; subclasses pick the verdict per request.</summary>
    private abstract class FakeCriticLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var draft = ExtractDraft(request.Messages[0].Content);
            return Task.FromResult(new LlmResponse(
                Verdict(draft), [], new LlmUsage(10, 10, 0m), "fake-critic", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();

        protected abstract string Verdict(string draft);

        // CriticPrompt.BuildUserPrompt → "Research notes:\n…\n\nDraft to review:\n{draft}"
        private static string ExtractDraft(string userPrompt)
        {
            const string marker = "Draft to review:\n";
            var i = userPrompt.IndexOf(marker, StringComparison.Ordinal);
            return i < 0 ? userPrompt : userPrompt[(i + marker.Length)..];
        }

        protected static string Json(int factual, int tone, int length, int banned, string? issueFix = null)
        {
            var issues = issueFix is null
                ? "[]"
                : $"[{{\"location\":\"draft\",\"severity\":\"blocker\",\"fix\":\"{issueFix}\"}}]";
            return $"{{\"scores\":{{\"factual_accuracy\":{factual},\"tone\":{tone},\"length\":{length}," +
                   $"\"banned_phrases\":{banned}}},\"issues\":{issues}}}";
        }
    }

    /// <summary>Rejects everything (all axes = 1) → catches every defect AND flags every control.</summary>
    private sealed class CatchesAllCritic : FakeCriticLlm
    {
        protected override string Verdict(string draft) => Json(1, 1, 1, 1, "Everything is wrong.");
    }

    /// <summary>Passes everything (all axes = 5, no issues) → catches nothing, flags nothing.</summary>
    private sealed class CatchesNoneCritic : FakeCriticLlm
    {
        protected override string Verdict(string draft) => Json(5, 5, 5, 5);
    }

    /// <summary>
    /// A realistic critic that only detects LENGTH (out of [800,1600]) and BANNED phrases (substring) — it
    /// MISSES factual + tone defects. So it catches the 4 length + 4 banned defects (8/18) and never flags a
    /// clean control (all clean drafts are in-bounds + carry no banned phrase).
    /// </summary>
    private sealed class LengthAndBannedOnlyCritic : FakeCriticLlm
    {
        protected override string Verdict(string draft)
        {
            var length = draft.Length is >= 800 and <= 1600 ? 5 : 1;
            var banned = CrewBannedPhrases.List.Any(p => draft.Contains(p, StringComparison.OrdinalIgnoreCase))
                ? 1 : 5;
            return Json(5, 5, length, banned);
        }
    }

    /// <summary>Emits unparseable garbage → the real parser fail-closes (ParseFailed) on EVERY case.</summary>
    private sealed class GarbageCritic : FakeCriticLlm
    {
        protected override string Verdict(string draft) => "I'm sorry, I can't help with that.";
    }

    /// <summary>
    /// Scores every axis a benign 5 but raises ONE blocker issue whose fix contains the factual keyword
    /// ("not in the research notes") — exercises the OR keyword-fallback "caught" path, which must fire for
    /// factual defects (score >2, but the severe issue keyword-matches the axis) and miss the other axes.
    /// </summary>
    private sealed class FactualIssueOnlyCritic : FakeCriticLlm
    {
        protected override string Verdict(string draft) =>
            Json(5, 5, 5, 5, "This claim is not in the research notes; remove it.");
    }

    /// <summary>
    /// A well-calibrated oracle: it recognises every injected defect by its deterministic signature (the
    /// fabricated factual sentence / tone aside, the banned-phrase splice, an out-of-bounds length) and leaves
    /// every clean control untouched. So catch-rate = 1.0 AND false-positive-rate = 0.0 → the gate PASSES.
    /// </summary>
    private sealed class GoodCritic : FakeCriticLlm
    {
        private static readonly string[] FactualFragments = Goldens
            .Where(g => g.DefectType == CriticDefectInjector.FactualHallucination)
            .Select(g => g.InjectionParam!.Trim())
            .ToArray();

        private static readonly string[] ToneFragments = Goldens
            .Where(g => g.DefectType == CriticDefectInjector.ToneBreak)
            .Select(g => g.InjectionParam!.Trim())
            .ToArray();

        protected override string Verdict(string draft)
        {
            var factual = FactualFragments.Any(f => draft.Contains(f, StringComparison.Ordinal)) ? 1 : 5;
            var tone = ToneFragments.Any(f => draft.Contains(f, StringComparison.Ordinal)) ? 1 : 5;
            var length = draft.Length is >= 800 and <= 1600 ? 5 : 1;
            var banned = CrewBannedPhrases.List.Any(p => draft.Contains(p, StringComparison.OrdinalIgnoreCase))
                ? 1 : 5;
            return Json(factual, tone, length, banned);
        }
    }

    /// <summary>
    /// A slightly trigger-happy critic: catches every defect (so catch-rate stays high) but also flags a small
    /// share of clean controls — enough to push false-positive-rate JUST over 0.20, which must flip the gate.
    /// </summary>
    private sealed class NoisyCritic : FakeCriticLlm
    {
        private static readonly string[] FactualFragments = Goldens
            .Where(g => g.DefectType == CriticDefectInjector.FactualHallucination)
            .Select(g => g.InjectionParam!.Trim())
            .ToArray();

        private static readonly string[] ToneFragments = Goldens
            .Where(g => g.DefectType == CriticDefectInjector.ToneBreak)
            .Select(g => g.InjectionParam!.Trim())
            .ToArray();

        // Two of the 5 clean controls' draft prefixes — wrongly flagged → false-positive-rate 0.4 > 0.20.
        private static readonly string[] FlaggedControlPrefixes = Goldens
            .Where(g => g.DefectType == CriticDefectInjector.Clean)
            .Take(2)
            .Select(g => g.CleanDraft[..60])
            .ToArray();

        protected override string Verdict(string draft)
        {
            var factual = FactualFragments.Any(f => draft.Contains(f, StringComparison.Ordinal)) ? 1 : 5;
            var tone = ToneFragments.Any(f => draft.Contains(f, StringComparison.Ordinal)) ? 1 : 5;
            var length = draft.Length is >= 800 and <= 1600 ? 5 : 1;
            var banned = CrewBannedPhrases.List.Any(p => draft.Contains(p, StringComparison.OrdinalIgnoreCase))
                ? 1 : 5;

            // Wrongly flag two of the five clean controls (drafts untouched → prefix-match identifies them).
            if (factual == 5 && tone == 5 && length == 5 && banned == 5
                && FlaggedControlPrefixes.Any(p => draft.StartsWith(p, StringComparison.Ordinal)))
            {
                tone = 1; // false-positive tone flag on a clean control
            }

            return Json(factual, tone, length, banned);
        }
    }

    [Fact]
    public async Task RunAsync_CatchesAllCritic_CatchesEverythingButFailsGateOnFalsePositives()
    {
        var result = await Runner().RunAsync(
            Critic(new CatchesAllCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        Assert.Equal(Goldens.Count, result.N);
        Assert.Equal(1.0, result.CatchRate, 12);
        Assert.Equal(1.0, result.FalsePositiveRate, 12);
        // Catch-rate 1.0 but FP 1.0 > 0.20 → the gate is NOT passed. A flag-everything critic is not calibrated.
        Assert.False(result.Passed);
        Assert.All(result.Cases.Where(c => c.ExpectedAxis is not null), c => Assert.True(c.Caught));
        Assert.All(result.Cases.Where(c => c.ExpectedAxis is null), c => Assert.True(c.Flagged));
    }

    [Fact]
    public async Task RunAsync_CatchesNoneCritic_CatchRateAndFalsePositiveBothZero()
    {
        var result = await Runner().RunAsync(
            Critic(new CatchesNoneCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        Assert.Equal(0.0, result.CatchRate, 12);
        Assert.Equal(0.0, result.FalsePositiveRate, 12);
        Assert.False(result.Passed);
        Assert.All(result.Cases, c => Assert.False(c.Caught));
        Assert.All(result.Cases, c => Assert.False(c.Flagged));
    }

    [Fact]
    public async Task RunAsync_LengthAndBannedOnlyCritic_CatchesThoseAxesOnly()
    {
        var result = await Runner().RunAsync(
            Critic(new LengthAndBannedOnlyCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        var defects = result.Cases.Where(c => c.ExpectedAxis is not null).ToList();
        var expectedCaught = defects.Count(c => c.ExpectedAxis is "length" or "banned_phrases");
        Assert.Equal((double)expectedCaught / defects.Count, result.CatchRate, 12);

        // length + banned defects caught; factual + tone missed; no clean control flagged.
        Assert.All(defects.Where(c => c.ExpectedAxis is "length" or "banned_phrases"),
            c => Assert.True(c.Caught));
        Assert.All(defects.Where(c => c.ExpectedAxis is "factual_accuracy" or "tone"),
            c => Assert.False(c.Caught));
        Assert.Equal(0.0, result.FalsePositiveRate, 12);
    }

    [Fact]
    public async Task RunAsync_GoodCritic_HighCatchLowFalsePositive_PassesGate()
    {
        var result = await Runner().RunAsync(
            Critic(new GoodCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        // Catches every defect, flags no clean control → both gates clear.
        Assert.Equal(1.0, result.CatchRate, 12);
        Assert.Equal(0.0, result.FalsePositiveRate, 12);
        Assert.True(result.CatchRate >= CriticDefectEvalResult.CatchRateGate);
        Assert.True(result.FalsePositiveRate <= CriticDefectEvalResult.FalsePositiveGate);
        Assert.True(result.Passed);
        Assert.All(result.Cases.Where(c => c.ExpectedAxis is not null), c => Assert.True(c.Caught));
        Assert.All(result.Cases.Where(c => c.ExpectedAxis is null), c => Assert.False(c.Flagged));
    }

    [Fact]
    public async Task RunAsync_NoisyCritic_FalsePositiveJustOverGate_FailsGate()
    {
        var result = await Runner().RunAsync(
            Critic(new NoisyCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        // Still catches every defect (catch-rate clears the floor) …
        Assert.Equal(1.0, result.CatchRate, 12);
        Assert.True(result.CatchRate >= CriticDefectEvalResult.CatchRateGate);
        // … but wrongly flags 2 of 5 clean controls → FP 0.4 > 0.20, so the gate fails on precision.
        Assert.Equal(0.4, result.FalsePositiveRate, 12);
        Assert.True(result.FalsePositiveRate > CriticDefectEvalResult.FalsePositiveGate);
        Assert.False(result.Passed);
    }

    [Fact]
    public async Task RunAsync_GarbageCritic_ParseFailedCountsAsCaughtAndFlagsControls()
    {
        var result = await Runner().RunAsync(
            Critic(new GarbageCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        // An unreadable critic fail-closes: every defect reads as caught, every control as a false positive.
        Assert.Equal(1.0, result.CatchRate, 12);
        Assert.Equal(1.0, result.FalsePositiveRate, 12);
        Assert.All(result.Cases, c => Assert.True(c.ParseFailed));
        Assert.All(result.Cases.Where(c => c.ExpectedAxis is not null), c => Assert.True(c.Caught));
        Assert.All(result.Cases.Where(c => c.ExpectedAxis is null), c => Assert.True(c.Flagged));
    }

    [Fact]
    public async Task RunAsync_FactualIssueOnlyCritic_CaughtViaSevereIssueKeywordFallback()
    {
        var result = await Runner().RunAsync(
            Critic(new FactualIssueOnlyCritic()), persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        var defects = result.Cases.Where(c => c.ExpectedAxis is not null).ToList();

        // All axes scored a benign 5, so the ONLY way factual defects are caught is the keyword fallback on
        // the severe issue ("not in the research notes" → factual_accuracy). Other axes don't keyword-match it.
        Assert.All(defects.Where(c => c.ExpectedAxis == "factual_accuracy"),
            c => Assert.True(c.Caught, $"{c.Id} should be caught via the factual keyword fallback"));
        Assert.All(defects.Where(c => c.ExpectedAxis != "factual_accuracy"),
            c => Assert.False(c.Caught, $"{c.Id} ({c.ExpectedAxis}) must NOT keyword-match a factual issue"));
        // The blocker issue makes every clean control a false positive (advisory metric, but assert it's surfaced).
        Assert.Equal(1.0, result.FalsePositiveRate, 12);
    }

    [Fact]
    public async Task RunAsync_Persist_WritesEvalRunWithBreakdown()
    {
        var db = new CapturingDb();

        var result = await Runner().RunAsync(
            Critic(new LengthAndBannedOnlyCritic()), persist: true, db, gitSha: "abc123",
            TestContext.Current.CancellationToken);

        var run = Assert.Single(db.Added);
        Assert.Equal("criticdefects", run.Feature);
        Assert.Equal("n/a", run.JudgeModelId);
        Assert.Equal("abc123", run.GitSha);
        Assert.Equal(Goldens.Count, run.N);
        Assert.Equal(Math.Round((decimal)result.CatchRate, 3), run.Score);

        using var doc = JsonDocument.Parse(run.BreakdownJson!);
        var root = doc.RootElement;
        Assert.True(root.TryGetProperty("perAxisCatchRate", out var perAxis));
        Assert.True(perAxis.TryGetProperty("length", out _));
        Assert.True(perAxis.TryGetProperty("banned_phrases", out _));
        Assert.True(root.TryGetProperty("falsePositiveRate", out _));
        Assert.True(root.TryGetProperty("countsByType", out _));
        Assert.Equal(5, root.GetProperty("controls").GetInt32());
        Assert.Equal(18, root.GetProperty("defects").GetInt32());
    }
}
