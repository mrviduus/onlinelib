using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

/// <summary>
/// Adds pg_trgm extension and GiST indexes for fuzzy search on title/author.
/// </summary>
public partial class AddPgTrgmExtension : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Enable pg_trgm extension for trigram similarity matching
        migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

        // GiST index for fuzzy title matching
        migrationBuilder.Sql(@"
            CREATE INDEX idx_editions_title_trgm
            ON editions USING GIST(lower(title) gist_trgm_ops);
        ");

        // GiST index for fuzzy author matching
        migrationBuilder.Sql(@"
            CREATE INDEX idx_editions_authors_trgm
            ON editions USING GIST(lower(authors_json) gist_trgm_ops);
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_editions_authors_trgm;");
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_editions_title_trgm;");
        // Note: Not dropping pg_trgm extension as other things might use it
    }
}
