using TextStack.Vocabulary;

namespace TextStack.UnitTests;

public class SrsEngineTests
{
    private readonly ISrsEngine _srs = new SrsEngine();

    // === Correct answers: stage progression ===

    [Fact]
    public void Calculate_Stage0_OneCorrect_AdvancesToStage1()
    {
        var (stage, interval, consecutive) = _srs.Calculate(0, 0, 0, true);

        Assert.Equal(1, stage);
        Assert.Equal(1, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage1_OneCorrect_StaysAtStage1()
    {
        var (stage, interval, consecutive) = _srs.Calculate(1, 0, 1, true);

        Assert.Equal(1, stage);
        Assert.Equal(1, interval);
        Assert.Equal(1, consecutive);
    }

    [Fact]
    public void Calculate_Stage1_TwoCorrect_AdvancesToStage2()
    {
        var (stage, interval, consecutive) = _srs.Calculate(1, 1, 1, true);

        Assert.Equal(2, stage);
        Assert.Equal(3, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage2_TwoCorrect_AdvancesToStage3()
    {
        var (stage, interval, consecutive) = _srs.Calculate(2, 1, 3, true);

        Assert.Equal(3, stage);
        Assert.Equal(7, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage3_TwoCorrect_AdvancesToStage4()
    {
        var (stage, interval, consecutive) = _srs.Calculate(3, 1, 7, true);

        Assert.Equal(4, stage);
        Assert.Equal(14, interval);
        Assert.Equal(0, consecutive);
    }

    // === Mastered stage: interval growth ===

    [Fact]
    public void Calculate_Stage4_Correct_DoublesInterval()
    {
        var (stage, interval, consecutive) = _srs.Calculate(4, 0, 14, true);

        Assert.Equal(4, stage);
        Assert.Equal(28, interval);
        Assert.Equal(1, consecutive);
    }

    [Fact]
    public void Calculate_Stage4_Correct_CapsAt60Days()
    {
        var (stage, interval, _) = _srs.Calculate(4, 0, 50, true);

        Assert.Equal(4, stage);
        Assert.Equal(60, interval);
    }

    [Fact]
    public void Calculate_Stage4_Correct_AlreadyAtCap_StaysAt60()
    {
        var (stage, interval, _) = _srs.Calculate(4, 0, 60, true);

        Assert.Equal(4, stage);
        Assert.Equal(60, interval);
    }

    // === Incorrect answers: demotion ===

    [Fact]
    public void Calculate_Stage0_Incorrect_StaysAtStage0()
    {
        var (stage, interval, consecutive) = _srs.Calculate(0, 0, 0, false);

        Assert.Equal(0, stage);
        Assert.Equal(0.5, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage1_Incorrect_StaysAtStage1()
    {
        var (stage, interval, consecutive) = _srs.Calculate(1, 1, 1, false);

        Assert.Equal(1, stage);
        Assert.Equal(0.5, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage2_Incorrect_DemotesToStage1()
    {
        var (stage, interval, consecutive) = _srs.Calculate(2, 1, 3, false);

        Assert.Equal(1, stage);
        Assert.Equal(1, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage3_Incorrect_DemotesToStage2()
    {
        var (stage, interval, consecutive) = _srs.Calculate(3, 0, 7, false);

        Assert.Equal(2, stage);
        Assert.Equal(1, interval);
        Assert.Equal(0, consecutive);
    }

    [Fact]
    public void Calculate_Stage4_Incorrect_DemotesToStage2()
    {
        var (stage, interval, consecutive) = _srs.Calculate(4, 3, 28, false);

        Assert.Equal(2, stage);
        Assert.Equal(1, interval);
        Assert.Equal(0, consecutive);
    }

    // === ConsecutiveCorrect tracking ===

    [Fact]
    public void Calculate_Stage2_FirstCorrect_IncrementsConsecutive()
    {
        var (stage, _, consecutive) = _srs.Calculate(2, 0, 3, true);

        Assert.Equal(2, stage);
        Assert.Equal(1, consecutive);
    }

    [Fact]
    public void Calculate_Stage0_Correct_ResetsConsecutiveOnAdvance()
    {
        var (_, _, consecutive) = _srs.Calculate(0, 0, 0, true);

        Assert.Equal(0, consecutive);
    }

    // === GetReviewMode ===

    [Theory]
    [InlineData(0, false, "multiple_choice")]
    [InlineData(0, true, "multiple_choice")]
    [InlineData(1, false, "multiple_choice")]
    [InlineData(1, true, "multiple_choice")]
    [InlineData(2, false, "typed_recall")]
    [InlineData(2, true, "typed_recall")]
    [InlineData(3, false, "typed_recall")]
    public void GetReviewMode_ReturnsExpected(int stage, bool hasSentence, string expected)
    {
        Assert.Equal(expected, _srs.GetReviewMode(stage, hasSentence));
    }

    [Fact]
    public void GetReviewMode_Stage3_WithSentence_ReturnsContext()
    {
        Assert.Equal("context", _srs.GetReviewMode(3, true));
    }

    [Fact]
    public void GetReviewMode_Stage4_WithoutSentence_ReturnsTypedRecall()
    {
        Assert.Equal("typed_recall", _srs.GetReviewMode(4, false));
    }

    [Fact]
    public void GetReviewMode_Stage4_WithSentence_ReturnsContextOrTypedRecall()
    {
        var results = new HashSet<string>();
        for (var i = 0; i < 50; i++)
            results.Add(_srs.GetReviewMode(4, true));

        Assert.Contains("context", results);
        Assert.Contains("typed_recall", results);
        Assert.Equal(2, results.Count);
    }

    [Fact]
    public void GetReviewMode_InvalidStage_ReturnsMultipleChoice()
    {
        Assert.Equal("multiple_choice", _srs.GetReviewMode(99, false));
    }
}
