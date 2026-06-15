using Application.Agents;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace TextStack.UnitTests;

/// <summary>
/// AI-041 — the four single-call crew specialists (Researcher/Drafter/Critic/Editor) and the critic JSON
/// parser, driven by a deterministic fake <see cref="ILlmService"/> (no key, no network). Verifies each agent
/// maps the gateway response into its typed output + a one-step transcript + usage (Iterations=1), the
/// critic parser is lenient and fail-closed, the prompt builders surface every brief constraint, and the four
/// compose into a real <see cref="CrewOrchestrator"/> plan via <see cref="CrewTasks.Of"/> (the AI-040 contract).
/// </summary>
public class CrewSpecialistsTests
{
    // ---- Fakes -------------------------------------------------------------------------------------

    /// <summary>Returns a single canned completion. StreamAsync is not used by single-call agents.</summary>
    private sealed class FakeLlm(string text, LlmUsage? usage = null) : ILlmService
    {
        public string? LastSystem { get; private set; }
        public string? LastUser { get; private set; }
        public string? LastFeatureTag { get; private set; }
        public int? LastMaxOutputTokens { get; private set; }

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            LastSystem = request.SystemPrompt;
            LastUser = request.Messages[0].Content;
            LastFeatureTag = request.FeatureTag;
            LastMaxOutputTokens = request.MaxOutputTokens;
            return Task.FromResult(new LlmResponse(
                text, [], usage ?? new LlmUsage(40, 20, 0.002m), "m", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static AgentContext Ctx() =>
        new(null, null, Guid.NewGuid(), new ServiceCollection().BuildServiceProvider());

    private static ContentBrief Brief(
        IReadOnlyList<string>? banned = null, string? style = null,
        int min = 120, int max = 300, string lang = "English") =>
        new("Author", "biography", min, max, banned ?? ["a leading authority", "needs no introduction"], lang, style);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- 1. Per-agent: output mapping + transcript + usage -----------------------------------------

    [Fact]
    public async Task ResearcherAgent_FakeReturnsText_ParsesTrimmedNotesWithOneStepAndUsage()
    {
        var llm = new FakeLlm("  - born 1900\n- wrote books  ");
        var agent = new ResearcherAgent(llm);

        var result = await agent.RunAsync(new ResearchInput(Brief(), "source"), Ctx(), Ct);

        Assert.Equal("- born 1900\n- wrote books", result.Output.Notes);
        Assert.Equal("crew.researcher", llm.LastFeatureTag);
        Assert.Equal(600, llm.LastMaxOutputTokens);
        AssertSingleLlmStepAndUsage(result);
    }

    [Fact]
    public async Task DrafterAgent_FakeReturnsText_ParsesTrimmedDraft()
    {
        var llm = new FakeLlm("  A short bio.  ");
        var agent = new DrafterAgent(llm);

        var result = await agent.RunAsync(
            new DraftInput(Brief(), new ResearchNotes("- fact")), Ctx(), Ct);

        Assert.Equal("A short bio.", result.Output.Text);
        Assert.Equal("crew.drafter", llm.LastFeatureTag);
        Assert.Equal(500, llm.LastMaxOutputTokens);
        AssertSingleLlmStepAndUsage(result);
    }

    [Fact]
    public async Task CriticAgent_FakeReturnsJson_ParsesTypedCritiqueResult()
    {
        const string json = """{"scores":{"factual_accuracy":4,"tone":5,"length":3,"banned_phrases":5},"issues":[{"location":"line 1","severity":"major","fix":"tighten"}]}""";
        var llm = new FakeLlm(json);
        var agent = new CriticAgent(llm);

        var result = await agent.RunAsync(
            new CritiqueInput(Brief(), new Draft("d"), new ResearchNotes("n")), Ctx(), Ct);

        Assert.False(result.Output.ParseFailed);
        Assert.Equal(4, result.Output.FactualAccuracy);
        Assert.Equal(5, result.Output.Tone);
        var issue = Assert.Single(result.Output.Issues);
        Assert.Equal("major", issue.Severity);
        Assert.Equal("crew.critic", llm.LastFeatureTag);
        Assert.Equal(700, llm.LastMaxOutputTokens);
        AssertSingleLlmStepAndUsage(result);
    }

    [Fact]
    public async Task EditorAgent_FakeReturnsText_ParsesTrimmedDraft()
    {
        var llm = new FakeLlm("  Revised bio.  ");
        var agent = new EditorAgent(llm);

        var critique = new CritiqueResult(2, 3, 4, 5,
            [new CritiqueIssue("line 1", "blocker", "remove unsupported claim")], false);
        var result = await agent.RunAsync(
            new EditInput(Brief(), new Draft("d"), critique), Ctx(), Ct);

        Assert.Equal("Revised bio.", result.Output.Text);
        Assert.Equal("crew.editor", llm.LastFeatureTag);
        Assert.Equal(500, llm.LastMaxOutputTokens);
        AssertSingleLlmStepAndUsage(result);
    }

    [Fact]
    public async Task CriticAgent_FakeReturnsEmptyText_FailsClosedNotThrows()
    {
        var agent = new CriticAgent(new FakeLlm(""));
        var result = await agent.RunAsync(
            new CritiqueInput(Brief(), new Draft("d"), new ResearchNotes("n")), Ctx(), Ct);

        Assert.True(result.Output.ParseFailed);
        Assert.Equal(1, result.Output.FactualAccuracy);
        AssertSingleLlmStepAndUsage(result);
    }

    [Fact]
    public async Task DrafterAgent_FakeReturnsEmptyText_ProducesEmptyDraftNotThrows()
    {
        var agent = new DrafterAgent(new FakeLlm("   "));
        var result = await agent.RunAsync(
            new DraftInput(Brief(), new ResearchNotes("- fact")), Ctx(), Ct);

        Assert.Equal(string.Empty, result.Output.Text);
    }

    [Fact]
    public async Task ResearcherAgent_FakeReturnsEmptyText_ProducesEmptyNotesNotThrows()
    {
        var agent = new ResearcherAgent(new FakeLlm(""));
        var result = await agent.RunAsync(new ResearchInput(Brief(), "source"), Ctx(), Ct);
        Assert.Equal(string.Empty, result.Output.Notes);
    }

    [Fact]
    public async Task SingleCallAgent_UsageWithZeroCost_PreservesNonZeroTokens()
    {
        // Guard against zeros being lost / hardcoded: map LlmUsage through verbatim, only Iterations is fixed at 1.
        var agent = new DrafterAgent(new FakeLlm("ok", new LlmUsage(123, 45, 0m)));
        var result = await agent.RunAsync(
            new DraftInput(Brief(), new ResearchNotes("- fact")), Ctx(), Ct);

        Assert.Equal(1, result.Usage.Iterations);
        Assert.Equal(123, result.Usage.InputTokensTotal);
        Assert.Equal(45, result.Usage.OutputTokensTotal);
        Assert.Equal(0m, result.Usage.CostUsdTotal);
    }

    [Fact]
    public async Task SingleCallAgent_CancelledToken_PropagatesToGateway()
    {
        // The agent must forward the caller's CancellationToken to the gateway; a pre-cancelled token
        // surfaces as OperationCanceledException, not a completed run on a cancelled request.
        var agent = new DrafterAgent(new CancelObservingLlm());
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            agent.RunAsync(new DraftInput(Brief(), new ResearchNotes("- fact")), Ctx(), cts.Token));
    }

    /// <summary>Throws if the token it receives is not the cancelled one the caller passed — proves forwarding.</summary>
    private sealed class CancelObservingLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult(new LlmResponse("x", [], new LlmUsage(1, 1, 0m), "m", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static void AssertSingleLlmStepAndUsage<T>(AgentResult<T> result)
    {
        Assert.Equal(1, result.Usage.Iterations);
        Assert.Equal(40, result.Usage.InputTokensTotal);
        Assert.Equal(20, result.Usage.OutputTokensTotal);
        Assert.Equal(0.002m, result.Usage.CostUsdTotal);
        var step = Assert.Single(result.Steps);
        Assert.Equal(0, step.Index);
        Assert.Equal("llm_response", step.Kind);
        Assert.True(step.Payload.TryGetProperty("text", out _));
    }

    // ---- 2. CriticOutputParser ---------------------------------------------------------------------

    [Fact]
    public void Parse_WellFormedJson_ReturnsTypedResult()
    {
        const string json = """{"scores":{"factual_accuracy":5,"tone":4,"length":3,"banned_phrases":2},"issues":[{"location":"intro","severity":"blocker","fix":"cite source"}]}""";
        var r = CriticOutputParser.Parse(json);

        Assert.False(r.ParseFailed);
        Assert.Equal(5, r.FactualAccuracy);
        Assert.Equal(4, r.Tone);
        Assert.Equal(3, r.Length);
        Assert.Equal(2, r.BannedPhrases);
        var issue = Assert.Single(r.Issues);
        Assert.Equal("intro", issue.Location);
        Assert.Equal("blocker", issue.Severity);
        Assert.Equal("cite source", issue.Fix);
    }

    [Fact]
    public void Parse_JsonFenced_StripsFencesAndParses()
    {
        const string text = "```json\n{\"scores\":{\"factual_accuracy\":3,\"tone\":3,\"length\":3,\"banned_phrases\":3},\"issues\":[]}\n```";
        var r = CriticOutputParser.Parse(text);

        Assert.False(r.ParseFailed);
        Assert.Equal(3, r.FactualAccuracy);
        Assert.Empty(r.Issues);
    }

    [Fact]
    public void Parse_TrailingProseAfterBrace_StillParses()
    {
        const string text = "{\"scores\":{\"factual_accuracy\":4,\"tone\":4,\"length\":4,\"banned_phrases\":4},\"issues\":[]} Hope that helps!";
        var r = CriticOutputParser.Parse(text);

        Assert.False(r.ParseFailed);
        Assert.Equal(4, r.Tone);
    }

    [Fact]
    public void Parse_ScoreAboveRange_ClampedToFive()
    {
        const string text = """{"scores":{"factual_accuracy":9,"tone":3,"length":3,"banned_phrases":3},"issues":[]}""";
        Assert.Equal(5, CriticOutputParser.Parse(text).FactualAccuracy);
    }

    [Fact]
    public void Parse_ScoreBelowRange_ClampedToOne()
    {
        const string text = """{"scores":{"factual_accuracy":0,"tone":3,"length":3,"banned_phrases":3},"issues":[]}""";
        Assert.Equal(1, CriticOutputParser.Parse(text).FactualAccuracy);
    }

    [Fact]
    public void Parse_UnrecognizedNonEmptySeverity_CoercedToMajor()
    {
        // Fail-closed direction: a critic that writes something we don't recognize ("critical"/"catastrophic")
        // must NOT be silently downgraded below the blocker threshold — coerce up to "major", not down to "minor".
        const string text = """{"scores":{"factual_accuracy":3,"tone":3,"length":3,"banned_phrases":3},"issues":[{"location":"x","severity":"critical","fix":"fix it"}]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.Equal("major", Assert.Single(r.Issues).Severity);
    }

    [Fact]
    public void Parse_EmptySeverity_StaysMinor()
    {
        // Absent severity (whitespace) is "not asserted" — don't manufacture a severity; stays minor.
        const string text = """{"scores":{"factual_accuracy":3,"tone":3,"length":3,"banned_phrases":3},"issues":[{"location":"x","severity":"   ","fix":"fix it"}]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.Equal("minor", Assert.Single(r.Issues).Severity);
    }

    [Fact]
    public void Parse_IssueMissingFix_Dropped()
    {
        const string text = """{"scores":{"factual_accuracy":3,"tone":3,"length":3,"banned_phrases":3},"issues":[{"location":"x","severity":"major","fix":""},{"location":"y","severity":"minor","fix":"keep"}]}""";
        var r = CriticOutputParser.Parse(text);
        var issue = Assert.Single(r.Issues);
        Assert.Equal("keep", issue.Fix);
    }

    [Theory]
    [InlineData("not json at all")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("{ this is broken ][")]
    public void Parse_Garbage_FailsClosed(string text)
    {
        var r = CriticOutputParser.Parse(text);

        Assert.True(r.ParseFailed);
        Assert.Equal(1, r.FactualAccuracy);
        Assert.Equal(1, r.Tone);
        Assert.Equal(1, r.Length);
        Assert.Equal(1, r.BannedPhrases);
        var issue = Assert.Single(r.Issues);
        Assert.Equal("blocker", issue.Severity);
    }

    [Fact]
    public void Parse_MissingScores_FailsClosed()
    {
        var r = CriticOutputParser.Parse("""{"issues":[]}""");
        Assert.True(r.ParseFailed);
    }

    [Fact]
    public void Parse_NeverThrows_OnAnyInput()
    {
        // Exhaustively confirm fail-closed: no input shape throws.
        foreach (var s in new[] { null, "", "{", "}", "{}", "[]", "{\"scores\":null}", "garbage {nested {brace}}" })
        {
            var ex = Record.Exception(() => CriticOutputParser.Parse(s!));
            Assert.Null(ex);
        }
    }

    // ---- 2b. CriticOutputParser — adversarial real-LLM failure shapes -------------------------------

    /// <summary>
    /// The keystone safety property: garbage must NEVER deserialize to a clean, high-scored pass
    /// (false-clean is the worst failure — a hallucinating drafter sneaks past a critic that merely
    /// failed to format). A missing score field defaults to 0 → clamps to the WORST score (1), not the best.
    /// </summary>
    [Fact]
    public void Parse_ScoresObjectPresentButFieldMissing_ClampsToWorstNotBest()
    {
        const string text = """{"scores":{"tone":5,"length":5,"banned_phrases":5},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);

        // It parsed (scores object present) but the missing axis must read as 1, never 5.
        Assert.False(r.ParseFailed);
        Assert.Equal(1, r.FactualAccuracy);
        Assert.Equal(5, r.Tone);
    }

    [Fact]
    public void Parse_NullScoreField_FailsClosed()
    {
        // null into a non-nullable int throws in System.Text.Json → fail closed (worst), never false-clean.
        const string text = """{"scores":{"factual_accuracy":null,"tone":5,"length":5,"banned_phrases":5},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.True(r.ParseFailed);
        Assert.Equal(1, r.FactualAccuracy);
    }

    [Fact]
    public void Parse_ScoreAsQuotedString_ReadsNumber()
    {
        // AllowReadingFromString — "4" must parse, not fail closed.
        const string text = """{"scores":{"factual_accuracy":"4","tone":"3","length":"3","banned_phrases":"3"},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(4, r.FactualAccuracy);
    }

    [Fact]
    public void Parse_ScoreAsFloat_FailsClosed_NeverFalseClean()
    {
        // 4.5 into an int property: System.Text.Json throws → fail-closed (worst), never a silent high pass.
        const string text = """{"scores":{"factual_accuracy":4.5,"tone":4.5,"length":4.5,"banned_phrases":4.5},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.True(r.ParseFailed);
        Assert.Equal(1, r.FactualAccuracy);
    }

    [Fact]
    public void Parse_NonNumericScore_FailsClosed()
    {
        const string text = """{"scores":{"factual_accuracy":"good","tone":3,"length":3,"banned_phrases":3},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.True(r.ParseFailed);
    }

    [Fact]
    public void Parse_TopLevelJsonArrayWrappingTheObject_RecoversInnerObject()
    {
        // A critic that wraps its verdict in a single-element array still parses CLEAN: the balanced-brace scan
        // starts at the first '{' (object-0) and stops at its matching '}', ignoring the array brackets.
        const string text = """[{"scores":{"factual_accuracy":5,"tone":5,"length":5,"banned_phrases":5},"issues":[]}]""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(5, r.FactualAccuracy);
    }

    [Fact]
    public void Parse_MultiElementTopLevelArray_RecoversFirstObjectScores()
    {
        // The balanced-brace scan extracts object-0 cleanly (stops at its own '}'), so a multi-element array
        // [{good},{bad}] no longer splices across elements — object-0's real scores are recovered.
        const string text = """[{"scores":{"factual_accuracy":5,"tone":4,"length":3,"banned_phrases":2},"issues":[]},{"x":1}]""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(5, r.FactualAccuracy);
        Assert.Equal(4, r.Tone);
        Assert.Equal(3, r.Length);
        Assert.Equal(2, r.BannedPhrases);
    }

    [Fact]
    public void Parse_NestedBracesInsideStringValue_ParsesCorrectly()
    {
        // A '}' inside a string value must not confuse the brace scan: in-string braces are ignored.
        const string text = """{"scores":{"factual_accuracy":3,"tone":3,"length":3,"banned_phrases":3},"issues":[{"location":"intro","severity":"minor","fix":"replace the {placeholder} token"}]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal("replace the {placeholder} token", Assert.Single(r.Issues).Fix);
    }

    [Fact]
    public void Parse_TrailingProseBraceAfterValidJson_ParsesCleanRecoversScores()
    {
        // A perfectly valid critique followed by prose containing a stray brace (emoticon ":}", "${var}") now
        // PARSES CLEAN: the balanced-brace scan stops at the object's own closing '}' and ignores the prose.
        const string text = """{"scores":{"factual_accuracy":5,"tone":4,"length":3,"banned_phrases":2},"issues":[]} Looks good :} and use ${var}""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(5, r.FactualAccuracy);
        Assert.Equal(4, r.Tone);
        Assert.Equal(3, r.Length);
        Assert.Equal(2, r.BannedPhrases);
    }

    [Fact]
    public void Parse_InStringBraceInIssueLocation_ParsesClean()
    {
        // A brace inside a string value ("${x}") must not break the scan — in-string braces are ignored.
        const string text = """{"scores":{"factual_accuracy":4,"tone":4,"length":4,"banned_phrases":4},"issues":[{"location":"use ${x}","severity":"minor","fix":"a"}]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(4, r.FactualAccuracy);
        var issue = Assert.Single(r.Issues);
        Assert.Equal("use ${x}", issue.Location);
    }

    [Fact]
    public void Parse_EscapedQuoteInStringValue_ParsesClean()
    {
        // An escaped quote inside a string ('\"') must not prematurely close the string and expose its braces.
        const string text = """{"scores":{"factual_accuracy":4,"tone":4,"length":4,"banned_phrases":4},"issues":[{"location":"x","severity":"minor","fix":"say \"hi\" {now}"}]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal("say \"hi\" {now}", Assert.Single(r.Issues).Fix);
    }

    [Fact]
    public void Parse_LeadingBomAndJunkBeforeJson_StillParses()
    {
        const string text = "﻿Here is my review:\n{\"scores\":{\"factual_accuracy\":4,\"tone\":4,\"length\":4,\"banned_phrases\":4},\"issues\":[]}";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(4, r.Tone);
    }

    [Fact]
    public void Parse_DuplicateScoreKeys_LastWins_NeverThrows()
    {
        // System.Text.Json takes the last duplicate; assert it doesn't throw and stays in range.
        const string text = """{"scores":{"factual_accuracy":1,"factual_accuracy":5,"tone":3,"length":3,"banned_phrases":3},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.False(r.ParseFailed);
        Assert.Equal(5, r.FactualAccuracy);
    }

    [Fact]
    public void Parse_IssuesNotAnArray_FailsClosed()
    {
        // "issues" as an object (not array) → deserialize throws on the list → fail closed.
        const string text = """{"scores":{"factual_accuracy":4,"tone":4,"length":4,"banned_phrases":4},"issues":{"location":"x"}}""";
        var r = CriticOutputParser.Parse(text);
        Assert.True(r.ParseFailed);
    }

    [Fact]
    public void Parse_SeverityUppercaseAndPadded_NormalizedToLowercase()
    {
        const string text = """{"scores":{"factual_accuracy":3,"tone":3,"length":3,"banned_phrases":3},"issues":[{"location":"x","severity":"  BLOCKER  ","fix":"do it"}]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.Equal("blocker", Assert.Single(r.Issues).Severity);
    }

    [Fact]
    public void Parse_IssueNullSeverityAndNullLocation_DefaultsApplied()
    {
        const string text = """{"scores":{"factual_accuracy":3,"tone":3,"length":3,"banned_phrases":3},"issues":[{"fix":"do it"}]}""";
        var r = CriticOutputParser.Parse(text);
        var issue = Assert.Single(r.Issues);
        Assert.Equal("draft", issue.Location);
        Assert.Equal("minor", issue.Severity);
    }

    [Fact]
    public void Parse_NaNScore_FailsClosed()
    {
        // NaN is not valid JSON number → deserialize throws → fail closed.
        const string text = """{"scores":{"factual_accuracy":NaN,"tone":3,"length":3,"banned_phrases":3},"issues":[]}""";
        var r = CriticOutputParser.Parse(text);
        Assert.True(r.ParseFailed);
    }

    // ---- 3. Prompt builders surface brief constraints ----------------------------------------------

    [Fact]
    public void DrafterPrompt_SurfacesLengthBannedPhraseAndLanguage()
    {
        var brief = Brief(banned: ["a leading authority"], style: "neutral encyclopedic", lang: "Ukrainian", min: 150, max: 280);
        var system = Application.Agents.Prompts.DrafterPrompt.BuildSystemPrompt(brief);

        Assert.Contains("150-280 characters", system);
        Assert.Contains("a leading authority", system);
        Assert.Contains("Ukrainian", system);
        Assert.Contains("neutral encyclopedic", system);
    }

    [Fact]
    public void CriticPrompt_SurfacesSchemaTokensLengthAndBannedPhrase()
    {
        var brief = Brief(banned: ["needs no introduction"], min: 100, max: 200);
        var system = Application.Agents.Prompts.CriticPrompt.BuildSystemPrompt(brief);

        Assert.Contains("factual_accuracy", system);
        Assert.Contains("severity", system);
        Assert.Contains("100-200 characters", system);
        Assert.Contains("needs no introduction", system);
        Assert.Contains("blocker", system);
    }

    [Fact]
    public void EditorPrompt_SurfacesLengthAndLanguage()
    {
        var brief = Brief(lang: "Spanish", min: 90, max: 160);
        var system = Application.Agents.Prompts.EditorPrompt.BuildSystemPrompt(brief);

        Assert.Contains("90-160 characters", system);
        Assert.Contains("Spanish", system);
        Assert.Contains("blocker", system); // blockers-first ordering
    }

    [Fact]
    public void ResearcherPrompt_NamesFieldAndEntityAndGroundsOnSource()
    {
        var brief = Brief();
        var system = Application.Agents.Prompts.ResearcherPrompt.BuildSystemPrompt(brief);

        Assert.Contains("biography", system);
        Assert.Contains("Author", system);
        Assert.Contains("ONLY", system); // grounded on source only
    }

    [Fact]
    public void DrafterPrompt_NoBannedPhrases_OmitsBannedClause()
    {
        var brief = Brief(banned: []);
        var system = Application.Agents.Prompts.DrafterPrompt.BuildSystemPrompt(brief);
        Assert.DoesNotContain("Do not use these phrases", system);
    }

    // ---- 4. Crew integration smoke -----------------------------------------------------------------

    private sealed class CrewState
    {
        public ResearchNotes? Research { get; set; }
        public Draft? Draft { get; set; }
        public CritiqueResult? Critique { get; set; }
        public Draft? Final { get; set; }
    }

    [Fact]
    public async Task FourSpecialists_ComposedIntoCrewPlan_ThreadStateAndTranscriptInOrder()
    {
        var brief = Brief();
        var source = "Born 1900. Wrote three novels.";

        // Distinct canned outputs per specialist so we can prove the state threaded through each stage.
        var researcher = new ResearcherAgent(new FakeLlm("- born 1900\n- wrote three novels"));
        var drafter = new DrafterAgent(new FakeLlm("Born in 1900, the author wrote three novels."));
        var critic = new CriticAgent(new FakeLlm(
            """{"scores":{"factual_accuracy":5,"tone":4,"length":4,"banned_phrases":5},"issues":[{"location":"end","severity":"minor","fix":"add a period"}]}"""));
        var editor = new EditorAgent(new FakeLlm("Born in 1900, the author wrote three acclaimed novels."));

        var plan = new CrewPlan<CrewState>("content",
        [
            new CrewStage<CrewState>("research",
            [
                CrewTasks.Of<CrewState, ResearchInput, ResearchNotes>(
                    "researcher", researcher,
                    _ => new ResearchInput(brief, source),
                    (s, o) => s.Research = o),
            ]),
            new CrewStage<CrewState>("draft",
            [
                CrewTasks.Of<CrewState, DraftInput, Draft>(
                    "drafter", drafter,
                    s => new DraftInput(brief, s.Research!),
                    (s, o) => s.Draft = o),
            ]),
            new CrewStage<CrewState>("critique",
            [
                CrewTasks.Of<CrewState, CritiqueInput, CritiqueResult>(
                    "critic", critic,
                    s => new CritiqueInput(brief, s.Draft!, s.Research!),
                    (s, o) => s.Critique = o),
            ]),
            new CrewStage<CrewState>("edit",
            [
                CrewTasks.Of<CrewState, EditInput, Draft>(
                    "editor", editor,
                    s => new EditInput(brief, s.Draft!, s.Critique!),
                    (s, o) => s.Final = o),
            ]),
        ], new CrewOptions());

        var result = await new CrewOrchestrator().RunAsync(plan, new CrewState(), Ctx(), Ct);

        Assert.Equal(CrewRunRecordFactory.StatusCompleted, result.Status);

        // State threaded research -> draft -> critique -> edit.
        Assert.Equal("- born 1900\n- wrote three novels", result.State.Research!.Notes);
        Assert.Equal("Born in 1900, the author wrote three novels.", result.State.Draft!.Text);
        Assert.False(result.State.Critique!.ParseFailed);
        Assert.Equal(5, result.State.Critique.FactualAccuracy);
        Assert.Equal("Born in 1900, the author wrote three acclaimed novels.", result.State.Final!.Text);

        // Transcript: exactly 4 CrewStepEntry in declaration order.
        Assert.Equal(4, result.Steps.Count);
        Assert.Equal(["research", "draft", "critique", "edit"], result.Steps.Select(e => e.Stage));
        Assert.Equal(["researcher", "drafter", "critic", "editor"], result.Steps.Select(e => e.AgentName));
        Assert.Equal([0, 1, 2, 3], result.Steps.Select(e => e.Index));
        Assert.Equal(4, result.Usage.Iterations);
    }
}
