using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveUkrainianContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hard-delete user data tied to uk editions (FK is SetNull — would orphan otherwise).
            migrationBuilder.Sql(@"
                DELETE FROM user_ratings
                WHERE edition_id IN (SELECT id FROM editions WHERE language = 'uk');
            ");

            migrationBuilder.Sql(@"
                DELETE FROM highlights
                WHERE edition_id IN (SELECT id FROM editions WHERE language = 'uk');
            ");

            migrationBuilder.Sql(@"
                DELETE FROM reading_sessions
                WHERE edition_id IN (SELECT id FROM editions WHERE language = 'uk');
            ");

            migrationBuilder.Sql(@"
                DELETE FROM user_mood_tags
                WHERE edition_id IN (SELECT id FROM editions WHERE language = 'uk');
            ");

            migrationBuilder.Sql(@"
                DELETE FROM vocabulary_words
                WHERE edition_id IN (SELECT id FROM editions WHERE language = 'uk')
                   OR language = 'uk';
            ");

            // Drop uk editions — cascades to chapters, edition_authors, book_files,
            // ingestion_jobs, text_stack_imports, linting_results, book_assets,
            // user_libraries, reading_progress, bookmarks, notes.
            migrationBuilder.Sql(@"
                DELETE FROM editions WHERE language = 'uk';
            ");

            // Remove orphaned works (no remaining editions).
            migrationBuilder.Sql(@"
                DELETE FROM works
                WHERE id NOT IN (SELECT DISTINCT work_id FROM editions WHERE work_id IS NOT NULL);
            ");

            // Blog: cascades to blog_comments, blog_likes.
            migrationBuilder.Sql(@"
                DELETE FROM blog_posts WHERE language = 'uk';
            ");

            migrationBuilder.Sql(@"
                DELETE FROM seo_templates WHERE language_code = 'uk';
            ");

            // Migrate users off uk native language.
            migrationBuilder.Sql(@"
                UPDATE users SET native_language = 'en' WHERE native_language = 'uk';
            ");

            // Rewrite FTS config function without the uk branch.
            migrationBuilder.Sql(@"
                CREATE OR REPLACE FUNCTION get_fts_config(lang text) RETURNS regconfig AS $$
                BEGIN
                    CASE lang
                        WHEN 'en' THEN RETURN 'english'::regconfig;
                        ELSE RETURN 'simple'::regconfig;
                    END CASE;
                END;
                $$ LANGUAGE plpgsql IMMUTABLE;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data deletion is not reversible. Restore from backup if needed.
            // FTS function rollback only.
            migrationBuilder.Sql(@"
                CREATE OR REPLACE FUNCTION get_fts_config(lang text) RETURNS regconfig AS $$
                BEGIN
                    CASE lang
                        WHEN 'uk' THEN RETURN 'simple'::regconfig;
                        WHEN 'en' THEN RETURN 'english'::regconfig;
                        ELSE RETURN 'simple'::regconfig;
                    END CASE;
                END;
                $$ LANGUAGE plpgsql IMMUTABLE;
            ");
        }
    }
}
