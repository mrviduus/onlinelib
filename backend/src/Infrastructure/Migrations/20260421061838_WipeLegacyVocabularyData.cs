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
            migrationBuilder.Sql("TRUNCATE TABLE vocabulary_reviews, vocabulary_words CASCADE;");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Non-reversible — data is gone.
        }
    }
}
