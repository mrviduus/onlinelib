using Application.Ai;

namespace TextStack.UnitTests;

/// <summary>
/// Pure regression-detection coverage (Phase 12 RLOps slice 5a): a drop ≥ threshold for a
/// feature+model present in both prior and current is flagged; below-threshold and no-prior
/// cases are not; feature+model isolation holds.
/// </summary>
public class EvalRegressionDetectorTests
{
    private static readonly EvalRegressionDetector Detector = new();

    [Fact]
    public void Detect_DropAtThreshold_FlagsRegression()
    {
        var prior = new[] { ("explain", "gpt-4.1-nano", 4.0) };
        var current = new[] { ("explain", "gpt-4.1-nano", 3.5) };

        var result = Detector.Detect(prior, current, dropThreshold: 0.5);

        var r = Assert.Single(result);
        Assert.Equal("explain", r.Feature);
        Assert.Equal("gpt-4.1-nano", r.ModelId);
        Assert.Equal(4.0, r.PriorScore);
        Assert.Equal(3.5, r.CurrentScore);
        Assert.Equal(0.5, r.Drop, 6);
    }

    [Fact]
    public void Detect_DropBelowThreshold_NoFlag()
    {
        var prior = new[] { ("explain", "gpt-4.1-nano", 4.0) };
        var current = new[] { ("explain", "gpt-4.1-nano", 3.6) }; // drop 0.4 < 0.5

        var result = Detector.Detect(prior, current, dropThreshold: 0.5);

        Assert.Empty(result);
    }

    [Fact]
    public void Detect_NoPriorForFeature_NoFlag()
    {
        var prior = Array.Empty<(string, string, double)>();
        var current = new[] { ("explain", "gpt-4.1-nano", 1.0) };

        var result = Detector.Detect(prior, current, dropThreshold: 0.5);

        Assert.Empty(result);
    }

    [Fact]
    public void Detect_ScoreImproved_NoFlag()
    {
        var prior = new[] { ("explain", "gpt-4.1-nano", 3.0) };
        var current = new[] { ("explain", "gpt-4.1-nano", 4.5) };

        var result = Detector.Detect(prior, current, dropThreshold: 0.5);

        Assert.Empty(result);
    }

    [Fact]
    public void Detect_IsolatesPerFeatureAndModel()
    {
        var prior = new[]
        {
            ("explain", "gpt-4.1-nano", 4.0),
            ("vocab", "gpt-4.1-nano", 4.0),
            ("explain", "other-model", 4.0),
        };
        var current = new[]
        {
            ("explain", "gpt-4.1-nano", 3.0), // regressed
            ("vocab", "gpt-4.1-nano", 4.0),   // stable
            ("explain", "other-model", 4.0),  // different model — stable
        };

        var result = Detector.Detect(prior, current, dropThreshold: 0.5);

        var r = Assert.Single(result);
        Assert.Equal("explain", r.Feature);
        Assert.Equal("gpt-4.1-nano", r.ModelId);
    }

    [Fact]
    public void Detect_SameFeatureDifferentModel_NotMatchedToPrior()
    {
        // Prior has the feature but under a DIFFERENT model id → current model has no prior → no flag.
        var prior = new[] { ("explain", "old-model", 4.0) };
        var current = new[] { ("explain", "new-model", 1.0) };

        var result = Detector.Detect(prior, current, dropThreshold: 0.5);

        Assert.Empty(result);
    }
}
