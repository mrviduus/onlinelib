using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Third pass at the "(for )" title cleanup. V1 and V2 used <c>\b</c> in
    /// their regex, which PostgreSQL's Advanced Regex Engine does NOT
    /// interpret as a word boundary — there it's a literal backspace
    /// (U+0008). So <c>\(\s*for\b\s*\)</c> never matched real "(for )"
    /// titles and they stayed broken in prod even after both prior
    /// migrations had been marked as applied.
    ///
    /// Verified in the broken DB row:
    /// <code>
    ///   SELECT 'X (for )' ~ '\(\s*for\b\s*\)\s*$';  -- false
    ///   SELECT 'X (for )' ~ '\(\s*for\s*\)\s*$';    -- true
    /// </code>
    ///
    /// Fix: drop <c>\b</c> entirely (the surrounding pattern already pins
    /// "for" inside parentheses, so a word boundary is redundant).
    /// Idempotent on already-clean rows.
    /// </summary>
    public partial class CleanUserBookTitlesV3 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Strip leftover template placeholders so "Title (for ${var})"
            // collapses to "Title (for )" before the paren rule fires.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(
                    title,
                    '\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+',
                    '',
                    'g')
                WHERE title ~ '\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+';
            ");

            // Strip a tail "(for [whitespace])". No \b — PostgreSQL ARE
            // doesn't treat it as a word boundary.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(
                    title,
                    '\s*\(\s*for\s*\)\s*$',
                    '',
                    'gi')
                WHERE title ~* '\(\s*for\s*\)\s*$';
            ");

            // Generic empty tail "()".
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(title, '\s*\(\s*\)\s*$', '', 'g')
                WHERE title ~ '\(\s*\)\s*$';
            ");

            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = btrim(title)
                WHERE title <> btrim(title);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data clean-up — no rollback.
        }
    }
}
