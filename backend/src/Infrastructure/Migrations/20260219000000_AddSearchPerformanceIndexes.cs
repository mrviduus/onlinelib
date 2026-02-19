using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

public partial class AddSearchPerformanceIndexes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Drop dead index — was on removed authors_json column
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_editions_authors_trgm;");

        // Replace GiST → GIN on editions.title (faster for %like% + similarity)
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_editions_title_trgm;");
        migrationBuilder.Sql(@"
            CREATE INDEX idx_editions_title_trgm
            ON editions USING GIN(lower(title) gin_trgm_ops);
        ");

        // GIN trgm on authors.name — fuzzy author search was completely unindexed
        migrationBuilder.Sql(@"
            CREATE INDEX idx_authors_name_trgm
            ON authors USING GIN(lower(name) gin_trgm_ops);
        ");

        // Composite index for the WHERE clause used in every search query
        migrationBuilder.Sql(@"
            CREATE INDEX idx_editions_site_status
            ON editions (site_id, status);
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_editions_site_status;");
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_authors_name_trgm;");

        // Restore original GiST index
        migrationBuilder.Sql("DROP INDEX IF EXISTS idx_editions_title_trgm;");
        migrationBuilder.Sql(@"
            CREATE INDEX idx_editions_title_trgm
            ON editions USING GIST(lower(title) gist_trgm_ops);
        ");
    }
}
