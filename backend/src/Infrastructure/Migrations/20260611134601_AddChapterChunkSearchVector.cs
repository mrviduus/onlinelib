using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChapterChunkSearchVector : Migration
    {
        // Lexical retrieval for hybrid RAG (AI-023). Raw SQL (not model-driven): the generated column
        // stays out of the EF model — retrieval is hand-written Npgsql, like chapters' search_vector.
        // NB: 'english' is a constant (generated columns require an immutable expression), unlike the
        // chapters trigger which picks a per-language config. The RAG corpus is English-dominant; a
        // multilingual chunk index is out of scope.
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE chapter_chunk
                ADD COLUMN IF NOT EXISTS search_vector tsvector
                GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS ix_chapter_chunk_search_vector
                ON chapter_chunk USING GIN (search_vector);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_chapter_chunk_search_vector;");
            migrationBuilder.Sql("ALTER TABLE chapter_chunk DROP COLUMN IF EXISTS search_vector;");
        }
    }
}
