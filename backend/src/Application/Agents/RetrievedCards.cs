using System.Text.Json;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// The set of vocabulary cards the Tutor agent's tools ACTUALLY returned during a run, reconstructed from
/// the persisted step transcript. This is the ground truth the final-plan parser checks every planned item
/// against (AI-Agent-2 anti-hallucination): every planned <c>wordId</c> MUST be a card a tool returned, and
/// its word + SRS stage are RE-PROJECTED from the retrieved row (never the model's echo) so the tutor can
/// never invent a card id or attach a fabricated stage to a real word. Built ONLY from <c>tool_result</c>
/// steps whose <c>ok</c> is true — a failed tool contributes nothing, so an item can never be grounded in an
/// error payload. Harvests from the two card-returning tools (<c>get_due_vocabulary</c>,
/// <c>get_weak_vocabulary</c>); the reading-context / example-sentence tools carry no cards.
/// </summary>
public sealed class RetrievedCards
{
    private readonly Dictionary<Guid, RetrievedCard> _cards;

    private RetrievedCards(Dictionary<Guid, RetrievedCard> cards) => _cards = cards;

    public static RetrievedCards Empty { get; } = new(new Dictionary<Guid, RetrievedCard>());

    /// <summary>True when a planned item's word id was genuinely retrieved (and yields its row to re-project from).</summary>
    public bool TryGet(Guid wordId, out RetrievedCard card) => _cards.TryGetValue(wordId, out card!);

    public int Count => _cards.Count;

    /// <summary>The retrieved cards (used by the eval to assert no invented id survived).</summary>
    public IReadOnlyCollection<RetrievedCard> All => _cards.Values;

    /// <summary>Reconstructs the retrieved cards from a run's step transcript (the parser's grounding source).</summary>
    public static RetrievedCards FromSteps(IReadOnlyList<AgentStep> steps)
    {
        var cards = new Dictionary<Guid, RetrievedCard>();

        foreach (var step in steps)
        {
            if (step.Kind != "tool_result")
                continue;
            var payload = step.Payload;
            if (payload.ValueKind != JsonValueKind.Object)
                continue;
            if (!payload.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True)
                continue;
            if (!payload.TryGetProperty("tool", out var toolEl) || toolEl.ValueKind != JsonValueKind.String)
                continue;
            if (!payload.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.Object)
                continue;

            switch (toolEl.GetString())
            {
                case "get_due_vocabulary":
                case "get_weak_vocabulary":
                    Harvest(result, cards);
                    break;
            }
        }

        return new RetrievedCards(cards);
    }

    private static void Harvest(JsonElement result, Dictionary<Guid, RetrievedCard> cards)
    {
        if (!result.TryGetProperty("words", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return;
        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            if (!TryGetGuid(item, "wordId", out var wordId)) continue;
            var word = GetString(item, "word");
            if (string.IsNullOrWhiteSpace(word)) continue;

            // First harvest wins: the same card surfacing in both due + weak results keeps its first row.
            cards.TryAdd(wordId, new RetrievedCard(
                WordId: wordId,
                Word: word,
                Stage: GetInt(item, "stage") ?? 0,
                ConsecutiveCorrect: GetInt(item, "consecutiveCorrect") ?? 0,
                LastAccuracy: GetDouble(item, "lastAccuracy"),
                HasSentence: GetBool(item, "hasSentence")));
        }
    }

    private static bool TryGetGuid(JsonElement obj, string name, out Guid value)
    {
        value = Guid.Empty;
        return obj.TryGetProperty(name, out var v)
            && v.ValueKind == JsonValueKind.String
            && Guid.TryParse(v.GetString(), out value);
    }

    private static string? GetString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? GetInt(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

    private static double? GetDouble(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    private static bool GetBool(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
}

/// <summary>
/// A vocabulary card exactly as a tutor tool returned it — the ground truth a planned item re-projects its
/// word + SRS stage from (anti-hallucination). <see cref="LastAccuracy"/> is null when the card has no review
/// history yet.
/// </summary>
public sealed record RetrievedCard(
    Guid WordId,
    string Word,
    int Stage,
    int ConsecutiveCorrect,
    double? LastAccuracy,
    bool HasSentence);
