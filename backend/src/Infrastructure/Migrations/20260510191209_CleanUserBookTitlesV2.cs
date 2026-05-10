using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Follow-up to CleanUserBookTitles. The first pass used \s which in
    /// PostgreSQL matches only ASCII whitespace, so titles with invisible
    /// Unicode chars between the parens — zero-width space (U+200B), ZWJ
    /// (U+200D), BOM (U+FEFF), non-breaking space (U+00A0), soft hyphen
    /// (U+00AD) — slipped through and surfaced as "Title (for ?)" still.
    ///
    /// This pass strips those format chars first, then re-runs the
    /// "(for ...)" cleaner from V1. Idempotent on already-clean rows.
    /// </summary>
    public partial class CleanUserBookTitlesV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Replace each invisible Unicode format char with a regular space
            // so adjacent words stay separated; collapse runs of spaces below.
            // Codepoints (use \uXXXX so the migration source stays ASCII):
            //   U+00A0 NBSP, U+00AD SHY, U+034F CGJ, U+061C ALM,
            //   U+115F-U+1160 hangul fillers, U+17B4-U+17B5 khmer,
            //   U+180B-U+180F mongolian variation selectors,
            //   U+200B-U+200F zero-width family, U+202A-U+202E embedding controls,
            //   U+2060-U+206F word-joiner family, U+3164 hangul filler,
            //   U+FEFF BOM, U+FFA0 hwfw fillers, U+1D173-U+1D17A musical formats.
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(
                    title,
                    E'[ ­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ﻿]',
                    ' ',
                    'g')
                WHERE title ~ E'[ ­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ﻿]';
            ");

            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(title, '\s{2,}', ' ', 'g')
                WHERE title ~ '\s{2,}';
            ");

            // Strip leftover template placeholders so "Title (for ${var})"
            // collapses to "Title (for )".
            migrationBuilder.Sql(@"
                UPDATE user_books
                SET title = regexp_replace(
                    title,
                    '\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+',
                    '',
                    'g')
                WHERE title ~ '\$\{[^}]*\}|\{\{[^}]*\}\}|\$[A-Za-z_][\w.]*|%\w+';
            ");

            // Strip a tail "(for [whitespace])" from the title.
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

            // Tidy any trailing whitespace.
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
