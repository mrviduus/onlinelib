using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// The in-process AutoPublish content crew (Phase 7, AI-042). Runs the AI-041 specialists
/// (researcher → drafter → critic → editor) over <see cref="ILlmService"/> to generate ONE SEO prose field
/// for an Edition, via the generic AI-040 <see cref="CrewOrchestrator"/>. The endpoint runs it TWICE — once
/// per field (Description, Relevance) — so each field gets its own 4-stage plan, its own cost cap and its own
/// persisted <c>agent_run</c>.
///
/// DB-FREE by design: the source material is passed in (loaded by the endpoint), so an eval harness can drive
/// this with a fake <see cref="ILlmService"/> and a recording <see cref="IAgentRunWriter"/> — no network, no DB.
/// It NEVER writes the Edition and NEVER publishes: it returns the edited text + a fail-closed review verdict,
/// and the caller decides whether to apply it. The legacy bash + Claude-CLI poller stays the default path.
/// </summary>
public sealed class AutoPublishCrew(
    CrewOrchestrator orchestrator,
    ResearcherAgent researcher,
    DrafterAgent drafter,
    CriticAgent critic,
    EditorAgent editor,
    IAgentRunWriter runWriter)
{
    /// <summary>Per-field cost ceiling. 4 nano calls cost well under this; the cap is a hard runaway guard.</summary>
    public const decimal CostCapUsd = 0.02m;

    private const string CrewName = "autopublish";

    /// <summary>Shared mutable state threaded through the 4 stages by the orchestrator's deterministic folds.</summary>
    private sealed class FieldCrewState
    {
        public required ContentBrief Brief { get; init; }
        public required string SourceMaterial { get; init; }
        public ResearchNotes? Notes { get; set; }
        public Draft? Draft { get; set; }
        public CritiqueResult? Critique { get; set; }
        public Draft? Edited { get; set; }
    }

    /// <summary>
    /// Generates a single field. Runs the 4-stage crew (cost-capped, sequential), persists the run through the
    /// SAME <c>agent_run</c> path as a single agent (agent <c>crew.autopublish</c>), and returns the edited text
    /// plus the fail-closed review verdict. Writes nothing to the Edition; the caller owns the apply/publish call.
    /// </summary>
    public async Task<AutoPublishFieldResult> RunFieldAsync(
        ContentBrief brief, string sourceMaterial, AgentContext ctx, CancellationToken ct)
    {
        var state = new FieldCrewState { Brief = brief, SourceMaterial = sourceMaterial };
        var plan = BuildPlan();

        var result = await orchestrator.RunAsync(plan, state, ctx, ct);

        var editedText = state.Edited?.Text;
        var needsReview = NeedsReview(result.Status, state.Critique, editedText, brief.MinLength);

        // Persist through the existing AgentRunRecord / IAgentRunWriter path — no new table. The edited text is
        // the human-readable summary; the full sub-agent transcript is nested for replay (AI-045 UI).
        var record = CrewRunRecordFactory.From(
            ctx.AgentRunId,
            CrewName,
            ctx.UserId,
            ctx.EditionId,
            $"edition.{brief.FieldName}",
            editedText,
            result);
        await runWriter.WriteAsync(record, ct);

        return new AutoPublishFieldResult(editedText, state.Critique, needsReview, result.Status, ctx.AgentRunId);
    }

    /// <summary>
    /// The review gate, isolated so it is unit-testable as a pure decision. Fail-closed: a draft is only "clean"
    /// when the crew COMPLETED, the editor produced text that clears the brief's <paramref name="minLength"/> floor,
    /// the critic produced a parseable verdict, and that verdict raised no blockers. Anything else (error/budget
    /// halt, empty/whitespace or below-floor edited text, missing critique, unparseable critic, any blocker issue)
    /// → needs review, and the caller writes nothing. The length floor stops an empty/short editor output from
    /// silently overwriting a real Description / SeoRelevanceText (AI-042 P1).
    /// </summary>
    public static bool NeedsReview(string crewStatus, CritiqueResult? critique, string? editedText, int minLength)
    {
        if (crewStatus != CrewRunRecordFactory.StatusCompleted)
            return true;
        // Empty/whitespace or below the brief's hard floor: nothing safe to apply.
        if (string.IsNullOrWhiteSpace(editedText) || editedText.Trim().Length < minLength)
            return true;
        if (critique is null || critique.ParseFailed)
            return true;
        return critique.Issues.Any(i => i.Severity == "blocker");
    }

    /// <summary>The 4-stage sequential plan: each specialist is injected directly (no per-stage DI resolution).</summary>
    private CrewPlan<FieldCrewState> BuildPlan() =>
        new(CrewName,
        [
            new CrewStage<FieldCrewState>("research",
            [
                CrewTasks.Of<FieldCrewState, ResearchInput, ResearchNotes>(
                    "researcher", researcher,
                    s => new ResearchInput(s.Brief, s.SourceMaterial),
                    (s, o) => s.Notes = o),
            ]),
            new CrewStage<FieldCrewState>("draft",
            [
                CrewTasks.Of<FieldCrewState, DraftInput, Draft>(
                    "drafter", drafter,
                    s => new DraftInput(s.Brief, s.Notes!),
                    (s, o) => s.Draft = o),
            ]),
            new CrewStage<FieldCrewState>("critique",
            [
                CrewTasks.Of<FieldCrewState, CritiqueInput, CritiqueResult>(
                    "critic", critic,
                    s => new CritiqueInput(s.Brief, s.Draft!, s.Notes!),
                    (s, o) => s.Critique = o),
            ]),
            new CrewStage<FieldCrewState>("edit",
            [
                CrewTasks.Of<FieldCrewState, EditInput, Draft>(
                    "editor", editor,
                    s => new EditInput(s.Brief, s.Draft!, s.Critique!),
                    (s, o) => s.Edited = o),
            ]),
        ], new CrewOptions(CostCapUsd, MaxParallelism: 1));
}

/// <summary>
/// Outcome of one AutoPublish field run (AI-042). <see cref="EditedText"/> is the editor's final prose (null if
/// the crew never reached the edit stage). <see cref="Critique"/> is the critic's verdict (null on halt before
/// critique). <see cref="NeedsReview"/> is the fail-closed gate — true means "do not auto-apply". The DB write
/// and publish decision live in the caller, never here.
/// </summary>
public record AutoPublishFieldResult(
    string? EditedText,
    CritiqueResult? Critique,
    bool NeedsReview,
    string Status,
    Guid RunId);
