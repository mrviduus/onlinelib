using Api.Endpoints;
using Application.Agents;

namespace TextStack.UnitTests;

/// <summary>
/// AI-Agent-2 re-plan correctness backstops (the pure, deterministic parts of <c>SubmitFeedback</c>, not
/// LLM-trusted):
/// <list type="bullet">
/// <item><b>CountPlanItems</b> — reads the Web-serialized camelCase "items" so the re-plan keeps the session's
///   original size (the casing bug made it silently fall back to the default 5).</item>
/// <item><b>PriorPlanWordIds</b> — feedback for an id NOT in the prior plan is ignored (a client can't steer
///   the re-plan with ids it was never shown).</item>
/// <item><b>DropPassedCards</b> — a card the learner just answered correctly can never re-surface this turn,
///   regardless of what the model planned.</item>
/// </list>
/// </summary>
public class TutorEndpointsReplanTests
{
    private static readonly Guid A = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid B = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid C = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static TutorPlanItem Item(Guid id) =>
        new(id, "w", Stage: 1, TutorPlanItem.ExerciseRecognition, TutorPlanItem.DifficultyEasy, "why");

    private static TutorPlan PlanOf(params Guid[] ids) =>
        new(ids.Select(Item).ToList(), "rationale", "keep reading");

    // ---- FIX 2: CountPlanItems reads camelCase "items" ----------------------------------------------

    [Fact]
    public void CountPlanItems_WebSerializedThreeItemPlan_ReturnsThreeNotFallback()
    {
        // A 3-item plan serialized exactly as the endpoint persists it (Web defaults → "items").
        var json = PlanOf(A, B, C).ToPlanJson();

        var count = TutorEndpoints.CountPlanItems(json, fallback: 5);

        Assert.Equal(3, count); // not the default 5 — the casing bug used to make this always fall back
    }

    [Fact]
    public void CountPlanItems_MalformedJson_ReturnsFallback()
    {
        Assert.Equal(5, TutorEndpoints.CountPlanItems("not json", fallback: 5));
    }

    // ---- FIX 3b: feedback for an id not in the prior plan is dropped --------------------------------

    [Fact]
    public void PriorPlanWordIds_WebSerializedPlan_ExtractsItemIds()
    {
        var ids = TutorEndpoints.PriorPlanWordIds(PlanOf(A, B).ToPlanJson());

        Assert.Equal(new HashSet<Guid> { A, B }, ids);
    }

    [Fact]
    public void PriorPlanWordIds_FeedbackFilteredToPriorPlan_DropsUnknownId()
    {
        var prior = TutorEndpoints.PriorPlanWordIds(PlanOf(A, B).ToPlanJson());

        // Client submits feedback for A (in plan) and C (never shown) — only A survives the filter.
        var raw = new[]
        {
            new TutorFeedbackItem(A, Correct: true, 800),
            new TutorFeedbackItem(C, Correct: false, 5000), // arbitrary id, not in prior plan
        };
        var kept = raw.Where(f => prior.Contains(f.WordId)).ToList();

        var item = Assert.Single(kept);
        Assert.Equal(A, item.WordId);
    }

    // ---- FIX 3a: a just-passed card never re-surfaces in the re-plan --------------------------------

    [Fact]
    public void DropPassedCards_ItemAnsweredCorrectly_IsRemovedFromReplan()
    {
        // The model re-planned A (which the learner just PASSED) and B — A must be dropped.
        var replanned = PlanOf(A, B);
        var feedback = new[] { new TutorFeedbackItem(A, Correct: true, 800) };

        var result = TutorEndpoints.DropPassedCards(replanned, feedback);

        var item = Assert.Single(result.Items);
        Assert.Equal(B, item.WordId); // A dropped; the missed/other card stays
    }

    [Fact]
    public void DropPassedCards_MissedCard_IsKept()
    {
        var replanned = PlanOf(A);
        var feedback = new[] { new TutorFeedbackItem(A, Correct: false, 5000) };

        var result = TutorEndpoints.DropPassedCards(replanned, feedback);

        Assert.Single(result.Items); // a missed card is allowed to re-surface
    }
}
