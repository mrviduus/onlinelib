using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Strips trailing "(for ...)" parens from existing user_books.title rows
    /// when the inner content is empty, whitespace-only, or a leftover Atlas
    /// template variable (${var}, {{var}}, $var, %var). O'Reilly Early Release
    /// EPUBs ship "Title (for ${atlas.author_email})"; some upload pipelines
    /// stripped the variable but kept the parens, so titles surfaced as
    /// "Title (for  )" in users' libraries. New uploads are cleaned by
    /// BookTitleCleaner; this migration retroactively fixes existing rows.
    ///
    /// Idempotent: a second pass against already-clean rows is a no-op.
    /// One-way (no Down) — restoring the broken titles has no value.
    /// </summary>
    public partial class CleanUserBookTitles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Strip leftover template placeholders inside titles first, so
            // "Title (for ${var})" collapses to "Title (for )" before the
            // empty-paren rule fires.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(
                    title,
                    '\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+',
                    '',
                    'g')
                WHERE title ~ '\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+';
            ");

            // Strip a tail "(for [empty/whitespace])" from the title.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(
                    title,
                    '\s*\(\s*for\b\s*\)\s*$',
                    '',
                    'gi')
                WHERE title ~* '\(\s*for\b\s*\)\s*$';
            ");

            // Strip a generic empty tail "()".
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(title, '\s*\(\s*\)\s*$', '', 'g')
                WHERE title ~ '\(\s*\)\s*$';
            ");

            // Tidy any trailing whitespace left behind.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = btrim(title)
                WHERE title <> btrim(title);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data clean-up — no rollback. Restoring the stale empty parens
            // would just reintroduce the bug.
        }
    }
}
