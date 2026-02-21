namespace Application.Vocabulary;

public static class SrsEngine
{
    // Base intervals in days per stage: NEW, RECOGNITION, RECALL, CONTEXT, MASTERED
    private static readonly double[] BaseIntervals = [0, 1, 3, 7, 14];

    public static (int NewStage, double NewInterval, int NewConsecutive) Calculate(
        int stage, int consecutiveCorrect, double currentInterval, bool isCorrect)
    {
        if (isCorrect)
        {
            var needed = stage == 0 ? 1 : 2;
            var newConsecutive = consecutiveCorrect + 1;

            if (newConsecutive >= needed && stage < 4)
            {
                // Promote to next stage
                var newStage = stage + 1;
                return (newStage, BaseIntervals[newStage], 0);
            }

            if (stage == 4)
            {
                // Mastered: expand interval, cap at 60 days
                var newInterval = Math.Min(currentInterval * 2, 60);
                return (4, newInterval, newConsecutive);
            }

            // Stay same stage, keep base interval
            return (stage, stage == 0 ? 0 : BaseIntervals[stage], newConsecutive);
        }

        // Incorrect
        if (stage <= 1)
            return (stage, 0.5, 0);

        // Demote by 1 (mastered drops to RECALL, not CONTEXT)
        var demotedStage = stage == 4 ? 2 : stage - 1;
        return (demotedStage, 1, 0);
    }

    public static string GetReviewMode(int stage, bool hasSentence)
    {
        return stage switch
        {
            0 or 1 => "multiple_choice",
            2 => "typed_recall",
            3 => hasSentence ? "context" : "typed_recall",
            4 => hasSentence && Random.Shared.Next(2) == 0 ? "context" : "typed_recall",
            _ => "multiple_choice",
        };
    }
}
