using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

/// <inheritdoc />
public partial class MultilingualFTS : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Drop the computed column constraint and make it a regular column
        // PostgreSQL doesn't allow ALTER COLUMN on generated columns, so we recreate
        migrationBuilder.Sql(@"
            -- Drop the generated column and recreate as regular
            ALTER TABLE chapters
            ALTER COLUMN search_vector DROP EXPRESSION IF EXISTS;
        ");

        // Create function to get FTS config based on language
        migrationBuilder.Sql(@"
            CREATE OR REPLACE FUNCTION get_fts_config(lang text) RETURNS regconfig AS $$
            BEGIN
                CASE lang
                    WHEN 'uk' THEN RETURN 'simple'::regconfig;  -- Ukrainian uses simple (no stemming)
                    WHEN 'en' THEN RETURN 'english'::regconfig;
                    ELSE RETURN 'simple'::regconfig;
                END CASE;
            END;
            $$ LANGUAGE plpgsql IMMUTABLE;
        ");

        // Create trigger function to update search_vector based on edition language
        migrationBuilder.Sql(@"
            CREATE OR REPLACE FUNCTION chapters_search_vector_trigger() RETURNS trigger AS $$
            DECLARE
                edition_lang text;
                fts_config regconfig;
            BEGIN
                SELECT language INTO edition_lang FROM editions WHERE id = NEW.edition_id;
                fts_config := get_fts_config(edition_lang);
                NEW.search_vector := to_tsvector(fts_config, COALESCE(NEW.plain_text, ''));
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ");

        // Create trigger
        migrationBuilder.Sql(@"
            DROP TRIGGER IF EXISTS chapters_search_vector_update ON chapters;
            CREATE TRIGGER chapters_search_vector_update
                BEFORE INSERT OR UPDATE OF plain_text, edition_id
                ON chapters
                FOR EACH ROW
                EXECUTE FUNCTION chapters_search_vector_trigger();
        ");

        // Update existing chapters to set their search vectors
        migrationBuilder.Sql(@"
            UPDATE chapters c
            SET search_vector = to_tsvector(
                get_fts_config(e.language),
                COALESCE(c.plain_text, '')
            )
            FROM editions e
            WHERE c.edition_id = e.id;
        ");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Drop trigger and functions
        migrationBuilder.Sql("DROP TRIGGER IF EXISTS chapters_search_vector_update ON chapters;");
        migrationBuilder.Sql("DROP FUNCTION IF EXISTS chapters_search_vector_trigger();");
        migrationBuilder.Sql("DROP FUNCTION IF EXISTS get_fts_config(text);");

        // Restore computed column (will reset all search vectors to English)
        migrationBuilder.Sql(@"
            ALTER TABLE chapters
            ALTER COLUMN search_vector TYPE tsvector
            USING to_tsvector('english', COALESCE(plain_text, ''));
        ");
    }
}
