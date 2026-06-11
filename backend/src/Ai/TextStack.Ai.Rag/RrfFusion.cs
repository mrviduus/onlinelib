namespace TextStack.Ai.Rag;

/// <summary>
/// Reciprocal Rank Fusion (AI-023): merges several independently-ranked candidate lists into one
/// ranking without needing comparable per-list scores. Each item scores
/// <c>Σ 1 / (k + rank)</c> over the lists it appears in (1-based rank), so an item ranked highly by
/// more than one retriever (e.g. both vector and lexical) floats to the top. <c>k</c> damps the
/// contribution of low ranks; 60 is the value from the original Cormack et&#160;al. RRF paper.
/// Pure and order-stable — used by <see cref="RagService"/> to fuse vector + BM25 retrieval.
/// </summary>
public static class RrfFusion
{
    /// <summary>Rank constant from the RRF paper; larger flattens the curve, smaller favours top ranks.</summary>
    public const int DefaultRankConstant = 60;

    /// <summary>
    /// Fuses <paramref name="rankedLists"/> (each already ordered best-first) into a single ranking,
    /// returning every distinct item with its summed RRF score, highest first. Items keep first-seen
    /// order on ties (stable). Empty lists contribute nothing; an item in one list still ranks.
    /// </summary>
    public static IReadOnlyList<(T Item, double Score)> Fuse<T>(
        IEnumerable<IReadOnlyList<T>> rankedLists, int k = DefaultRankConstant)
        where T : notnull
    {
        var scores = new Dictionary<T, double>();
        var order = new List<T>();

        foreach (var list in rankedLists)
        {
            for (var i = 0; i < list.Count; i++)
            {
                var item = list[i];
                if (!scores.ContainsKey(item))
                {
                    scores[item] = 0;
                    order.Add(item); // preserve first-seen order for stable tie-breaking
                }
                scores[item] += 1.0 / (k + i + 1); // i is 0-based; RRF rank is 1-based
            }
        }

        return order
            .OrderByDescending(item => scores[item]) // OrderBy is stable → ties keep first-seen order
            .Select(item => (item, scores[item]))
            .ToList();
    }
}
