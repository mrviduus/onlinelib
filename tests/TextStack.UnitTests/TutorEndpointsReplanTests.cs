using Api.Endpoints;
using Application.Agents;
using Domain.Entities;

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

    // ---- FIX 1: enrich plan items from the caller's REAL vocab rows ---------------------------------

    private static VocabularyWord Card(Guid id, string? distractorsJson = null) => new()
    {
        Id = id,
        UserId = Guid.NewGuid(),
        SiteId = Guid.NewGuid(),
        Word = "alacrity",
        Language = "en",
        Translation = "жвавість",
        Definition = "brisk and cheerful readiness",
        Sentence = "She accepted with alacrity.",
        BookTitle = "Pride and Prejudice",
        Hint = "eager willingness",
        Distractors = distractorsJson,
    };

    [Fact]
    public void EnrichPlanItems_MatchingCard_PopulatesRenderFieldsFromRow()
    {
        var plan = PlanOf(A);
        var rows = new[] { Card(A, "[\"sloth\",\"reluctance\",\"delay\"]") };

        var dtos = TutorEndpoints.EnrichPlanItems(plan, rows);

        var dto = Assert.Single(dtos);
        Assert.Equal(A, dto.WordId);
        Assert.Equal("жвавість", dto.Translation);
        Assert.Equal("brisk and cheerful readiness", dto.Definition);
        Assert.Equal("She accepted with alacrity.", dto.Sentence);
        Assert.Equal("Pride and Prejudice", dto.BookTitle);
        Assert.Equal("eager willingness", dto.Hint);
        Assert.Equal(new[] { "sloth", "reluctance", "delay" }, dto.Distractors);
        // The planning fields are preserved alongside the render fields.
        Assert.Equal(TutorPlanItem.ExerciseRecognition, dto.ExerciseType);
        Assert.Equal("why", dto.Why);
    }

    [Fact]
    public void EnrichPlanItems_PlanIdNotInCallerCards_IsDroppedNotNullEnriched()
    {
        // Plan has A and B; only A is one of the caller's real cards. B must be DROPPED, not emitted with nulls.
        var plan = PlanOf(A, B);
        var rows = new[] { Card(A) };

        var dtos = TutorEndpoints.EnrichPlanItems(plan, rows);

        var dto = Assert.Single(dtos);
        Assert.Equal(A, dto.WordId);
        Assert.DoesNotContain(dtos, d => d.WordId == B); // anti-hallucination re-check holds
    }

    [Fact]
    public void EnrichPlanItems_NoMatchingCards_ReturnsEmpty()
    {
        var dtos = TutorEndpoints.EnrichPlanItems(PlanOf(A), cards: []);
        Assert.Empty(dtos);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("[]")]
    public void ParseDistractors_MissingOrMalformed_ReturnsEmptyList(string? json)
    {
        Assert.Empty(TutorEndpoints.ParseDistractors(json));
    }

    [Fact]
    public void ParseDistractors_ValidArray_DropsBlankEntries()
    {
        var result = TutorEndpoints.ParseDistractors("[\"a\",\"\",\"  \",\"b\"]");
        Assert.Equal(new[] { "a", "b" }, result);
    }

    // ---- FIX 2: re-plan turns are capped so a session can't loop forever ----------------------------

    [Fact]
    public void ReachedTurnCap_BelowCap_IsFalse()
    {
        Assert.False(TutorEndpoints.ReachedTurnCap(TutorEndpoints.MaxTurns - 1));
    }

    [Fact]
    public void ReachedTurnCap_AtCap_IsTrue()
    {
        // At MaxTurns the feedback path completes the session (empty plan) instead of re-planning.
        Assert.True(TutorEndpoints.ReachedTurnCap(TutorEndpoints.MaxTurns));
        Assert.True(TutorEndpoints.ReachedTurnCap(TutorEndpoints.MaxTurns + 1));
    }
}
