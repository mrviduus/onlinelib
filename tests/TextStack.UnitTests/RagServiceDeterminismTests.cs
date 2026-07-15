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

    /// <summary>
    /// Fix #3: the CATALOG summary gate must be STRICTLY less than the ceiling — a whole-chapter digest
    /// distils the chapter's ending, so a reader mid-way through their frontier chapter must not receive
    /// that chapter's summary. The user-book gate stays <c>&lt;=</c> (own upload, no spoiler concern, and
    /// its callers pass a null ceiling anyway). Guard both so a future edit can't silently loosen the
    /// catalog gate to <c>&lt;=</c> and leak the frontier chapter's whole-chapter summary.
    /// </summary>
    [Fact]
    public void CatalogSummarySql_GatesStrictlyLessThan_UserBookGatesLessOrEqual()
    {
        Assert.Contains("chapter_ord < @maxChapterOrd", RagService.BuildCatalogSummarySql());
        Assert.DoesNotContain("chapter_ord <= @maxChapterOrd", RagService.BuildCatalogSummarySql());

        Assert.Contains("chapter_ord <= @maxChapterOrd", RagService.BuildUserBookSummarySql());
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
            k: 3,
            maxSummaries: 3);

        Assert.Equal([s1, s2, f1], merged); // summaries first (order preserved), then fused fill, deduped, capped to k
    }

    [Fact]
    public void MergeSummariesFirst_SummariesExceedK_TrimsToK_DropsFused()
    {
        var s1 = Guid.NewGuid();
        var s2 = Guid.NewGuid();
        var s3 = Guid.NewGuid();
        var f1 = Guid.NewGuid();

        var merged = RagService.MergeSummariesFirst([f1], [s1, s2, s3], k: 2, maxSummaries: 3);

        Assert.Equal([s1, s2], merged);
    }

    [Fact]
    public void MergeSummariesFirst_NoSummaries_IsPlainTopK()
    {
        var f1 = Guid.NewGuid();
        var f2 = Guid.NewGuid();
        var f3 = Guid.NewGuid();

        var merged = RagService.MergeSummariesFirst([f1, f2, f3], [], k: 2, maxSummaries: 1);

        Assert.Equal([f1, f2], merged);
    }

    /// <summary>
    /// Fix #2: the k/2 cap must stop a many-chapter book from crowding out organic body excerpts — with
    /// 20 summaries and k=20 the merge must take exactly 10 summaries (maxSummaries) and fill the other 10
    /// with fused body chunks, never returning 20 summaries and zero body.
    /// </summary>
    [Fact]
    public void MergeSummariesFirst_ManySummaries_CappedAtMax_LeavesRoomForBody()
    {
        var summaries = Enumerable.Range(0, 20).Select(_ => Guid.NewGuid()).ToList();
        var body = Enumerable.Range(0, 20).Select(_ => Guid.NewGuid()).ToList();

        var merged = RagService.MergeSummariesFirst(body, summaries, k: 20, maxSummaries: 10);

        Assert.Equal(20, merged.Count);
        Assert.Equal(summaries.Take(10), merged.Take(10));   // exactly maxSummaries summaries, in order
        Assert.Equal(body.Take(10), merged.Skip(10));        // the rest is organic body — not crowded out
    }

    /// <summary>maxSummaries is a floor-respecting cap: k/2 for an odd k rounds down but stays ≥ 1 in prod.</summary>
    [Fact]
    public void MergeSummariesFirst_MaxSummariesOne_KeepsSingleSummary_ThenBody()
    {
        var s1 = Guid.NewGuid();
        var s2 = Guid.NewGuid();
        var f1 = Guid.NewGuid();
        var f2 = Guid.NewGuid();

        var merged = RagService.MergeSummariesFirst([f1, f2], [s1, s2], k: 4, maxSummaries: 1);

        Assert.Equal([s1, f1, f2], merged); // only 1 summary prepended, rest is body
    }

    // ---- target-chapter summary selection (Fix #6) ---------------------------------------------------

    [Fact]
    public void SelectSummaryIds_NoTarget_ReturnsAllInOrder()
    {
        var a = (Guid.NewGuid(), 0);
        var b = (Guid.NewGuid(), 1);
        var c = (Guid.NewGuid(), 2);

        var ids = RagService.SelectSummaryIds([a, b, c], targetChapterOrd: null);

        Assert.Equal([a.Item1, b.Item1, c.Item1], ids);
    }

    /// <summary>
    /// Lenient ord match: the reader's "chapter 5" maps to ord 5 (user books, 1-based) OR ord 4 (catalog,
    /// 0-based), so both are kept and every other chapter's summary is dropped.
    /// </summary>
    [Fact]
    public void SelectSummaryIds_Target_KeepsOnlyNandNminus1()
    {
        var ch3 = (Guid.NewGuid(), 3);
        var ch4 = (Guid.NewGuid(), 4);
        var ch5 = (Guid.NewGuid(), 5);
        var ch6 = (Guid.NewGuid(), 6);

        var ids = RagService.SelectSummaryIds([ch3, ch4, ch5, ch6], targetChapterOrd: 5);

        Assert.Equal([ch4.Item1, ch5.Item1], ids); // ord 4 (catalog) + ord 5 (user book); 3 and 6 dropped
    }

    [Fact]
    public void SelectSummaryIds_TargetWithNoMatch_ReturnsEmpty()
    {
        var ch0 = (Guid.NewGuid(), 0);
        var ch1 = (Guid.NewGuid(), 1);

        var ids = RagService.SelectSummaryIds([ch0, ch1], targetChapterOrd: 9);

        Assert.Empty(ids);
    }

    // ---- merge path end-to-end at fake level (Fix #4) ------------------------------------------------
    // The real RetrieveHybridAsync round-trip is integration-tested; here we drive its two pure seams
    // (SelectSummaryIds → MergeSummariesFirst) exactly as production composes them, for each scenario.

    private static List<Guid> RunMergePath(
        IReadOnlyList<Guid> fusedOrder,
        IReadOnlyList<(Guid Id, int ChapterOrd)> summaries,
        int? targetChapterOrd,
        int k)
        => RagService.MergeSummariesFirst(
            fusedOrder,
            RagService.SelectSummaryIds(summaries, targetChapterOrd),
            k,
            maxSummaries: Math.Max(1, k / 2));

    [Fact]
    public void MergePath_OverviewNoTarget_SummariesGuaranteedIn_CappedAtHalfK()
    {
        var summaries = Enumerable.Range(0, 20).Select(i => (Guid.NewGuid(), i)).ToList();
        var body = Enumerable.Range(0, 20).Select(_ => Guid.NewGuid()).ToList();

        var merged = RunMergePath(body, summaries, targetChapterOrd: null, k: 20);

        Assert.Equal(20, merged.Count);
        // Guaranteed in, but capped at k/2 so body still gets half the slots.
        Assert.Equal(10, merged.Count(id => summaries.Any(s => s.Item1 == id)));
        Assert.Equal(10, merged.Count(body.Contains));
    }

    [Fact]
    public void MergePath_NamedChapter_OnlyThatChaptersSummary_ThenBody()
    {
        var target = (Guid.NewGuid(), 5);
        var other = (Guid.NewGuid(), 2);
        var body = Enumerable.Range(0, 8).Select(_ => Guid.NewGuid()).ToList();

        var merged = RunMergePath(body, [other, target], targetChapterOrd: 5, k: 8);

        Assert.Equal(8, merged.Count);
        Assert.Equal(target.Item1, merged[0]);          // the named chapter's summary leads
        Assert.DoesNotContain(other.Item1, merged);     // no other chapter's summary
        Assert.Equal(body.Take(7), merged.Skip(1));     // rest is organic body (1 slot taken by the summary)
    }

    [Fact]
    public void MergePath_NonOverview_ByteIdenticalToPlainTopK()
    {
        var body = Enumerable.Range(0, 12).Select(_ => Guid.NewGuid()).ToList();

        // Non-overview = no summary fetch at all (summarySql null); production takes fusedIds.Take(k).
        var plain = body.Take(8).ToList();

        // Same inputs through the merge path with an EMPTY summary set must match the plain top-k exactly.
        var merged = RunMergePath(body, summaries: [], targetChapterOrd: null, k: 8);

        Assert.Equal(plain, merged);
    }
}
