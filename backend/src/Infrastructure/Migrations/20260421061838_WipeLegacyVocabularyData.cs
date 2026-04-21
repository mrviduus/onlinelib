using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WipeLegacyVocabularyData : Migration
    {
        // Anti-spiral Phase 1: no real users yet. Legacy rows predate Priority /
        // IsRetired / Source columns — leaving them at defaults would poison the
        // new queue (priority=0 floor, source="tap" for auto-promoted rows, etc).
        // Cheaper to wipe than to backfill.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Explicit child-first DELETE instead of TRUNCATE ... CASCADE.
            // CASCADE would silently drop rows from any future FK-dependent table
            // — naming each one keeps that surprise out of the migration. Add new
            // child tables here (and bump the order) before they get their FK.
            migrationBuilder.Sql("DELETE FROM vocabulary_reviews;");
            migrationBuilder.Sql("DELETE FROM vocabulary_words;");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Non-reversible — data is gone.
        }
    }
}
