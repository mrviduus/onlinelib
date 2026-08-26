using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Clears reading percentages and reading statistics that were recorded in two
    /// different units, so the canonical book-wide contract starts from clean data.
    ///
    /// <para><b>Why.</b> Neither <c>reading_progresses.percent</c> nor
    /// <c>reading_sessions.start_percent/end_percent</c> declared a unit, and the two
    /// clients picked different ones: mobile wrote a fraction of the current chapter,
    /// web a fraction of the whole book. A chapter fraction reaches 1.0 at the bottom
    /// of every chapter, so the stored numbers are not merely inconsistent — a
    /// meaningful share of them are simply wrong, and nothing can tell a legitimate
    /// 1.0 from a chapter boundary after the fact.</para>
    ///
    /// <para><b>Why a reset rather than a conversion.</b> The locator shape is a usable
    /// discriminator, so a conversion is possible — but it carries edge cases (the
    /// <c>{"type":"end"}</c> / <c>{"type":"start"}</c> mark-as-read sentinels are also
    /// brace-prefixed yet already book-scale) and it would only reconstruct a number
    /// that the very next save recomputes correctly anyway. The application has a
    /// single user, who chose the reset. Simpler is worth more here than clever.</para>
    ///
    /// <para><b>What is deliberately kept.</b> The catalog, the library, uploaded books
    /// and their files — nothing about the books themselves is touched. Crucially
    /// <c>reading_progresses.locator</c> and <c>user_books.progress_locator</c> survive,
    /// so every book still reopens exactly where the reader stopped; only the ambiguous
    /// percentage is cleared, and the next save recomputes it book-wide.</para>
    ///
    /// <para><b>Statistics are deleted, not converted.</b> <c>ReadingStatsService</c>
    /// and <c>AchievementChecker</c> read <c>end_percent &gt;= 0.99</c> as "finished a
    /// book", so every chapter a mobile reader completed minted a book completion and
    /// unlocked reading achievements early; <c>words_read</c> is derived from the same
    /// delta against the whole-book word count and is inflated by the same mistake.
    /// Achievements are re-earned from honest sessions. Reading goals are left alone —
    /// they are targets the user set, not derived data.</para>
    ///
    /// Idempotent: a second pass finds nothing to clear. One-way (no Down) — restoring
    /// numbers that were wrong has no value.
    /// </summary>
    public partial class ResetAmbiguousProgressAndStats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Position survives (locator, chapter_id); only the ambiguous number goes.
            migrationBuilder.Sql(@"
                UPDATE reading_progresses
                SET percent = NULL
                WHERE percent IS NOT NULL;
            ");

            // Same for uploads. Post-#412 these are mostly book-wide already, but the
            // payload builder fell back to a chapter fraction whenever the chapter list
            // had not resolved — which is every save made offline — and those rows are
            // indistinguishable from correct ones.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET progress_percent = NULL
                WHERE progress_percent IS NOT NULL;
            ");

            // Derived from the same ambiguous percent; cheaper to re-earn than to trust.
            migrationBuilder.Sql(@"DELETE FROM user_achievements;");
            migrationBuilder.Sql(@"DELETE FROM reading_sessions;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally empty. The cleared values were recorded in two conflicting
            // units and the deleted rows were derived from them; there is nothing worth
            // restoring, and no way to reconstruct it.
        }
    }
}
