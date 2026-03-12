using TextStack.Vocabulary.Contracts;

namespace TextStack.Vocabulary;

public interface IReviewCardBuilder
{
    List<ReviewCard> BuildCards(
        IReadOnlyList<WordForReview> dueWords,
        IReadOnlyList<DistractorPoolEntry> distractorPool);
}
