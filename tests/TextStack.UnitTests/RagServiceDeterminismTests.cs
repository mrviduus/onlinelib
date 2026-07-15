using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// Retrieval-determinism guard. Both hybrid retrievers (vector NN + lexical FTS) MUST carry a
/// deterministic <c>id</c> tie-breaker on their ORDER BY: <c>ts_rank_cd</c> ties are common and
/// float-distance ties happen on duplicate chunks — without the tie-breaker, tied rows at the LIMIT
/// cutoff swap between runs (heap-order dependent), changing the fused result set and making evals /
/// citations non-reproducible. The SQL runs raw against pgvector (exercised end-to-end by integration
/// tests); here we lock the ORDER BY invariant so a regression fails fast without a DB.
/// (RRF fusion itself is already deterministic — stable sort + first-seen tie order.)
/// </summary>
public class RagServiceDeterminismTests
{
    [Theory]
    [MemberData(nameof(HybridSqls))]
    public void HybridSql_BothRetrievers_OrderByCarriesIdTieBreaker(string name, string sql)
    {
        var statements = sql.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Equal(2, statements.Length);

        // Vector retriever: NN distance first, id as the deterministic tie-breaker.
        Assert.Contains("ORDER BY embedding <=> CAST(@q AS vector), id", statements[0]);

        // Lexical retriever: rank first, id as the deterministic tie-breaker.
        Assert.Contains("ORDER BY Score DESC, id", statements[1]);

        // Guard against a future edit re-introducing a bare ORDER BY in either statement.
        foreach (var statement in statements)
        {
            var orderBy = statement[statement.IndexOf("ORDER BY", StringComparison.Ordinal)..];
            var firstLine = orderBy[..orderBy.IndexOf('\n')].TrimEnd();
            Assert.EndsWith(", id", firstLine);
        }

        Assert.NotNull(name); // keeps the theory label used
    }

    public static TheoryData<string, string> HybridSqls() => new()
    {
        { "catalog", RagService.BuildCatalogSql() },
        { "userbook", RagService.BuildUserBookSql() },
    };
}
