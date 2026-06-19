using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// Phase 2 per-user isolation guard. <see cref="RagService.RetrieveUserBookAsync"/> MUST scope its
/// retrieval to BOTH <c>user_id</c> and <c>user_book_id</c> — a user must never retrieve another
/// user's chunks. The retrieval runs raw SQL against pgvector (exercised end-to-end by integration
/// tests); here we lock the load-bearing SQL invariant (both isolation filters, on the isolated
/// table, in BOTH retrievers) so a regression that drops the user_id filter fails fast without a DB.
/// </summary>
public class RagServiceUserBookIsolationTests
{
    [Fact]
    public void BuildUserBookSql_FiltersOnUserIdAndUserBookId_InBothRetrievers()
    {
        var sql = RagService.BuildUserBookSql();

        // Isolated table — never the catalog chapter_chunk.
        Assert.Contains("FROM user_chapter_chunk", sql);
        Assert.DoesNotContain("FROM chapter_chunk", sql);

        // Both isolation predicates present (defense in depth: denormalized user_id AND user_book_id).
        Assert.Contains("user_id = @userId", sql);
        Assert.Contains("user_book_id = @userBookId", sql);

        // The filters must appear in BOTH the vector and the lexical retriever, not just one — a leak
        // in either branch breaks isolation. The SQL is two statements; each must carry both filters.
        var statements = sql.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Equal(2, statements.Length);
        Assert.All(statements, s =>
        {
            Assert.Contains("user_id = @userId", s);
            Assert.Contains("user_book_id = @userBookId", s);
        });
    }

    [Fact]
    public void BuildUserBookSql_SurfacesUserChapterIdAsChapterId_ForDeepLinks()
    {
        // Citations deep-link into the USER reader, so ChapterId must be the user_chapter_id.
        var sql = RagService.BuildUserBookSql();
        Assert.Contains("user_chapter_id AS ChapterId", sql);
    }

    [Fact]
    public void BuildUserBookSql_IsolationFiltersAreBoundParams_NotInterpolated()
    {
        // The isolation boundary is only as strong as parameter binding — an interpolated id
        // (string-concatenated) would be both an injection vector AND could be coaxed to a foreign
        // id. Both filters must reference the @-prefixed Dapper params, and the SQL must contain no
        // literal interpolation hole for the ids.
        var sql = RagService.BuildUserBookSql();

        Assert.Contains("user_id = @userId", sql);
        Assert.Contains("user_book_id = @userBookId", sql);

        // No C#/SQL string interpolation braces leaked into the SQL (would mean an un-parameterized id).
        Assert.DoesNotContain("{", sql);
        Assert.DoesNotContain("}", sql);

        // The lexical branch must parameterize the user query into websearch_to_tsquery (not splice it).
        Assert.Contains("websearch_to_tsquery('english', @query)", sql);
    }

    [Fact]
    public void BuildUserBookSql_BothBranches_GateChapterOrdButNeverDropIsolation()
    {
        // The optional chapter-ord ceiling is null for user books ("whole book"). Assert that the
        // null gate is ANDed AFTER the isolation filters in BOTH statements — so a null ceiling can
        // only ever widen WITHIN the one (user_id, user_book_id) scope, never across books/users.
        var sql = RagService.BuildUserBookSql();
        var statements = sql.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        Assert.All(statements, s =>
        {
            var userIdx = s.IndexOf("user_id = @userId", StringComparison.Ordinal);
            var bookIdx = s.IndexOf("user_book_id = @userBookId", StringComparison.Ordinal);
            var gateIdx = s.IndexOf("@maxChapterOrd", StringComparison.Ordinal);

            Assert.True(userIdx >= 0 && bookIdx >= 0, "both isolation filters present");
            // The ord gate must not be the first WHERE predicate without the isolation filters before it.
            Assert.True(userIdx < gateIdx, "user_id filter precedes the (optional) chapter-ord gate");
            Assert.True(bookIdx < gateIdx, "user_book_id filter precedes the (optional) chapter-ord gate");
        });
    }

    [Fact]
    public void CatalogRetrieveSql_NeverTouchesUserChunkTable_NoCrossCorpus()
    {
        // Cross-corpus guard: the user-book SQL must target ONLY user_chapter_chunk, and must never
        // union/select the catalog chapter_chunk (which is NOT user-scoped). A regression that
        // accidentally pointed user retrieval at chapter_chunk would leak every user's catalog-less
        // assumptions AND drop the user_id filter (chapter_chunk has no user_id column).
        var sql = RagService.BuildUserBookSql();

        // Targets the isolated table exactly twice (vector + lexical), never the catalog table.
        Assert.Equal(2, CountOccurrences(sql, "FROM user_chapter_chunk"));
        Assert.DoesNotContain("FROM chapter_chunk", sql);
        Assert.DoesNotContain("edition_id", sql);
        Assert.DoesNotContain("UNION", sql);
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        var count = 0;
        var i = 0;
        while ((i = haystack.IndexOf(needle, i, StringComparison.Ordinal)) >= 0)
        {
            count++;
            i += needle.Length;
        }
        return count;
    }
}
