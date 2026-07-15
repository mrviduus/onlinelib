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

    // ---- "S2" summary-fetch SQL invariants -----------------------------------------------------------

    /// <summary>
    /// The summary-fetch statements (overview questions) MUST filter <c>is_summary</c> and carry the same
    /// deterministic <c>chapter_ord, id</c> ordering — the <c>id</c> tie-breaker keeps the guaranteed-summary
    /// merge reproducible, and the gate clause must still be present so an unread chapter's summary can't leak.
    /// </summary>
    [Theory]
    [MemberData(nameof(SummarySqls))]
    public void SummarySql_FiltersIsSummary_AndOrdersDeterministically(string name, string sql)
    {
        Assert.Contains("is_summary", sql);
        Assert.Contains("@maxChapterOrd", sql); // spoiler gate preserved on summaries

        // Single statement — its ORDER BY must end on the deterministic id tie-breaker.
        var lastLine = sql.TrimEnd().Split('\n')[^1].TrimEnd().TrimEnd(';');
        Assert.Equal("ORDER BY chapter_ord, id", lastLine);

        Assert.NotNull(name);
    }

    /// <summary>The user-book summary fetch MUST stay per-user isolated (both filters), like its hybrid siblings.</summary>
    [Fact]
    public void UserBookSummarySql_FiltersBothUserAndBook()
    {
        var sql = RagService.BuildUserBookSummarySql();
        Assert.Contains("user_id = @userId", sql);
        Assert.Contains("user_book_id = @userBookId", sql);
    }

    public static TheoryData<string, string> SummarySqls() => new()
    {
        { "catalog", RagService.BuildCatalogSummarySql() },
        { "userbook", RagService.BuildUserBookSummarySql() },
    };

    // ---- guaranteed-summary merge --------------------------------------------------------------------

    [Fact]
    public void MergeSummariesFirst_PrependsSummaries_ThenFusedFill_DedupedAndCapped()
    {
        var s1 = Guid.NewGuid();
        var s2 = Guid.NewGuid();
        var f1 = Guid.NewGuid();
        var f2 = Guid.NewGuid();

        // f1 also appears among the summaries (s1) — it must not be duplicated, and summaries lead.
        var merged = RagService.MergeSummariesFirst(
            fusedOrder: [s1, f1, f2],
            summaryIds: [s1, s2],
            k: 3);

        Assert.Equal([s1, s2, f1], merged); // summaries first (order preserved), then fused fill, deduped, capped to k
    }

    [Fact]
    public void MergeSummariesFirst_SummariesExceedK_TrimsToK_DropsFused()
    {
        var s1 = Guid.NewGuid();
        var s2 = Guid.NewGuid();
        var s3 = Guid.NewGuid();
        var f1 = Guid.NewGuid();

        var merged = RagService.MergeSummariesFirst([f1], [s1, s2, s3], k: 2);

        Assert.Equal([s1, s2], merged);
    }

    [Fact]
    public void MergeSummariesFirst_NoSummaries_IsPlainTopK()
    {
        var f1 = Guid.NewGuid();
        var f2 = Guid.NewGuid();
        var f3 = Guid.NewGuid();

        var merged = RagService.MergeSummariesFirst([f1, f2, f3], [], k: 2);

        Assert.Equal([f1, f2], merged);
    }
}
