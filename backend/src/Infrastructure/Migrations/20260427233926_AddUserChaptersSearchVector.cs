using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserChaptersSearchVector : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Generated tsvector column over title + plain_text
            migrationBuilder.Sql(@"
                ALTER TABLE user_chapters
                ADD COLUMN IF NOT EXISTS search_vector tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(plain_text, '')), 'B')
                ) STORED;
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS ix_user_chapters_search_vector
                ON user_chapters USING GIN (search_vector);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_user_chapters_search_vector;");
            migrationBuilder.Sql("ALTER TABLE user_chapters DROP COLUMN IF EXISTS search_vector;");
        }
    }
}
