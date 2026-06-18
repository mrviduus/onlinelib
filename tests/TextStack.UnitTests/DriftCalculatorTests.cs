using Application.Ai;

namespace TextStack.UnitTests;

/// <summary>
/// Pure embedding-drift math (Phase 12 RLOps slice 5b): mean-pool, cosine drift, and the
/// consecutive-breach alert state machine. No EF / embeddings — all algebra.
/// </summary>
public class DriftCalculatorTests
{
    // ── MeanPool ──────────────────────────────────────────────────────────────

    [Fact]
    public void MeanPool_KnownVectors_ReturnsElementWiseMean()
    {
        var result = DriftCalculator.MeanPool([
            [0f, 2f, 4f],
            [2f, 4f, 6f],
        ]);

        Assert.Equal([1f, 3f, 5f], result);
    }

    [Fact]
    public void MeanPool_SingleVector_ReturnsItUnchanged()
    {
        var result = DriftCalculator.MeanPool([[1f, 2f, 3f]]);
        Assert.Equal([1f, 2f, 3f], result);
    }

    [Fact]
    public void MeanPool_Empty_ReturnsEmpty()
    {
        Assert.Empty(DriftCalculator.MeanPool([]));
    }

    [Fact]
    public void MeanPool_RaggedLengths_ClampsToShortestNoThrow()
    {
        // Defensive guard: a model swap mid-window could yield mixed dims. Must clamp, never throw.
        var result = DriftCalculator.MeanPool([
            [2f, 4f, 6f, 8f],
            [4f, 8f],
        ]);
        Assert.Equal([3f, 6f], result);
    }

    [Fact]
    public void MeanPool_ContainsEmptyVector_ReturnsEmptyNoDivideError()
    {
        // dim collapses to 0 → empty centroid (the worker then treats it as a degenerate centroid;
        // CosineDrift on an empty vector returns 0 → no false alert). No throw / NaN.
        Assert.Empty(DriftCalculator.MeanPool([[1f, 2f], []]));
    }

    // ── CosineDrift ───────────────────────────────────────────────────────────

    [Fact]
    public void CosineDrift_IdenticalVectors_ReturnsZero()
    {
        var v = new[] { 1f, 2f, 3f };
        Assert.Equal(0, DriftCalculator.CosineDrift(v, (float[])v.Clone()), 6);
    }

    [Fact]
    public void CosineDrift_OrthogonalVectors_ReturnsOne()
    {
        Assert.Equal(1, DriftCalculator.CosineDrift([1f, 0f], [0f, 1f]), 6);
    }

    [Fact]
    public void CosineDrift_OppositeVectors_ReturnsTwo()
    {
        Assert.Equal(2, DriftCalculator.CosineDrift([1f, 0f], [-1f, 0f]), 6);
    }

    [Fact]
    public void CosineDrift_ZeroNormVector_ReturnsZeroGuard()
    {
        Assert.Equal(0, DriftCalculator.CosineDrift([0f, 0f], [1f, 2f]), 6);
    }

    [Fact]
    public void CosineDrift_LengthMismatch_ReturnsZeroGuard()
    {
        Assert.Equal(0, DriftCalculator.CosineDrift([1f, 2f], [1f, 2f, 3f]), 6);
    }

    // ── Decide (state machine) ────────────────────────────────────────────────

    [Fact]
    public void Decide_BelowThreshold_ResetsToOk()
    {
        // Prior streak of 3, but today's drift is below threshold → reset to 0 / ok.
        var d = DriftCalculator.Decide(
            priorConsecutiveBreaches: 3, driftScore: 0.05, threshold: 0.15,
            consecutiveDaysToAlert: 2, alreadyAlertedThisStreak: true);

        Assert.Equal(0, d.ConsecutiveBreaches);
        Assert.Equal("ok", d.AlertState);
        Assert.False(d.ShouldAlert);
    }

    [Fact]
    public void Decide_FirstBreach_Warning_NoAlert()
    {
        var d = DriftCalculator.Decide(
            priorConsecutiveBreaches: 0, driftScore: 0.2, threshold: 0.15,
            consecutiveDaysToAlert: 2, alreadyAlertedThisStreak: false);

        Assert.Equal(1, d.ConsecutiveBreaches);
        Assert.Equal("warning", d.AlertState);
        Assert.False(d.ShouldAlert); // need 2 consecutive days
    }

    [Fact]
    public void Decide_SecondConsecutiveBreach_AlertsOnce()
    {
        var d = DriftCalculator.Decide(
            priorConsecutiveBreaches: 1, driftScore: 0.2, threshold: 0.15,
            consecutiveDaysToAlert: 2, alreadyAlertedThisStreak: false);

        Assert.Equal(2, d.ConsecutiveBreaches);
        Assert.Equal("alerting", d.AlertState);
        Assert.True(d.ShouldAlert); // crossed into alerting → page once
    }

    [Fact]
    public void Decide_AlreadyAlertedThisStreak_DoesNotReAlert()
    {
        // Streak continues into a 3rd day; alert already fired → still alerting, but no re-page.
        var d = DriftCalculator.Decide(
            priorConsecutiveBreaches: 2, driftScore: 0.2, threshold: 0.15,
            consecutiveDaysToAlert: 2, alreadyAlertedThisStreak: true);

        Assert.Equal(3, d.ConsecutiveBreaches);
        Assert.Equal("alerting", d.AlertState);
        Assert.False(d.ShouldAlert);
    }

    [Fact]
    public void Decide_AtExactThreshold_CountsAsBreach()
    {
        var d = DriftCalculator.Decide(
            priorConsecutiveBreaches: 0, driftScore: 0.15, threshold: 0.15,
            consecutiveDaysToAlert: 2, alreadyAlertedThisStreak: false);

        Assert.Equal(1, d.ConsecutiveBreaches);
        Assert.Equal("warning", d.AlertState);
    }

    [Fact]
    public void Decide_ResetAfterAlerting_ClearsStreakAndAlertEligibility()
    {
        // Was alerting (streak 2, already alerted); today drops below threshold → ok, streak 0.
        var d = DriftCalculator.Decide(
            priorConsecutiveBreaches: 2, driftScore: 0.0, threshold: 0.15,
            consecutiveDaysToAlert: 2, alreadyAlertedThisStreak: true);

        Assert.Equal(0, d.ConsecutiveBreaches);
        Assert.Equal("ok", d.AlertState);
        Assert.False(d.ShouldAlert);
    }
}
