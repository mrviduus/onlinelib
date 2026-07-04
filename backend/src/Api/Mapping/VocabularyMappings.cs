using System.Linq.Expressions;
using Domain.Entities;
using TextStack.Vocabulary.Contracts;

namespace Api.Mapping;

// R4: single source of truth for the two mechanical VocabularyWord projections that were
// duplicated between the main review queue and the concept-cluster review endpoints.
// - DistractorPoolProject: EF projection (.Select(...) translated to SQL).
// - ToWordForReview: in-memory (the due-words list is materialised before mapping).
public static class VocabularyMappings
{
    public static readonly Expression<Func<VocabularyWord, DistractorPoolEntry>> DistractorPoolProject =
        w => new DistractorPoolEntry(w.Word, w.Language);

    public static WordForReview ToWordForReview(this VocabularyWord w) => new(
        w.Id, w.Word, w.Language,
        w.Translation, w.Definition,
        w.Sentence, w.BookTitle, w.Hint,
        w.Explanation, w.Distractors,
        w.Stage, w.TotalReviews);
}
