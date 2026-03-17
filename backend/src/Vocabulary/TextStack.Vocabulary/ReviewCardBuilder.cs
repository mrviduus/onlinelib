using System.Text.Json;
using TextStack.Vocabulary.Contracts;

namespace TextStack.Vocabulary;

public sealed class ReviewCardBuilder : IReviewCardBuilder
{
    private readonly ISrsEngine _srsEngine;

    public ReviewCardBuilder(ISrsEngine srsEngine)
    {
        _srsEngine = srsEngine;
    }

    public List<ReviewCard> BuildCards(
        IReadOnlyList<WordForReview> dueWords,
        IReadOnlyList<DistractorPoolEntry> distractorPool)
    {
        var poolByLang = distractorPool
            .GroupBy(d => d.Language)
            .ToDictionary(g => g.Key, g => g.ToList());

        var cards = new List<ReviewCard>(dueWords.Count);

        foreach (var w in dueWords)
        {
            var reviewMode = _srsEngine.GetReviewMode(w.Stage, w.Sentence != null);
            List<string>? options = null;
            int? correctIndex = null;
            string? blankSentence = null;

            if (reviewMode == "multiple_choice")
            {
                var llmDistractors = ParseDistractors(w.DistractorsJson);
                var hasPrompt = !string.IsNullOrWhiteSpace(w.Definition)
                    || !string.IsNullOrWhiteSpace(w.Translation);

                if (w.Sentence == null && !hasPrompt)
                {
                    reviewMode = "typed_recall";
                }
                else
                {
                    if (w.Sentence != null)
                        blankSentence = SentenceHelper.ReplaceWordInSentence(w.Sentence, w.Word);

                    var correct = w.Word;
                    List<string> distractors;

                    if (llmDistractors?.Count >= 3)
                    {
                        distractors = llmDistractors
                            .Where(d => !d.Equals(w.Word, StringComparison.OrdinalIgnoreCase))
                            .OrderBy(_ => Random.Shared.Next())
                            .Take(3)
                            .ToList();
                    }
                    else
                    {
                        var pool = poolByLang.GetValueOrDefault(w.Language, []);
                        distractors = pool
                            .Where(d => d.Word != w.Word)
                            .OrderBy(_ => Random.Shared.Next())
                            .Take(3)
                            .Select(d => d.Word)
                            .ToList();
                    }

                    if (distractors.Count < 3)
                    {
                        foreach (var fb in DistractorWords.ForLanguage(w.Language).OrderBy(_ => Random.Shared.Next()))
                        {
                            if (distractors.Count >= 3) break;
                            if (fb != correct && !distractors.Contains(fb))
                                distractors.Add(fb);
                        }
                    }

                    options = distractors.Take(3).Append(correct).OrderBy(_ => Random.Shared.Next()).ToList();
                    correctIndex = options.IndexOf(correct);
                }
            }

            if (reviewMode == "context" && w.Sentence != null)
                blankSentence = SentenceHelper.ReplaceWordInSentence(w.Sentence, w.Word);

            cards.Add(new ReviewCard(
                w.Id, w.Word, w.Translation, w.Definition,
                reviewMode, blankSentence, w.Sentence, w.BookTitle,
                w.Hint, options, correctIndex));
        }

        return cards;
    }

    private static List<string>? ParseDistractors(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(json);
            return list?.Where(w => w.Length > 1 && w.Any(char.IsLetter)).ToList();
        }
        catch { return null; }
    }
}
