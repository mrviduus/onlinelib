namespace TextStack.Vocabulary;

public interface ISrsEngine
{
    (int NewStage, double NewInterval, int NewConsecutive) Calculate(
        int stage, int consecutiveCorrect, double currentInterval, bool isCorrect);

    string GetReviewMode(int stage, bool hasSentence);
}
