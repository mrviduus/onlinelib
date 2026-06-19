using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBookRagIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "rag_chunk_count",
                table: "user_books",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "rag_embedded_count",
                table: "user_books",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "rag_error",
                table: "user_books",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "rag_indexed_at",
                table: "user_books",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rag_status",
                table: "user_books",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "user_chapter_chunk",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_chapter_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ord = table.Column<int>(type: "integer", nullable: false),
                    chapter_ord = table.Column<int>(type: "integer", nullable: false),
                    text = table.Column<string>(type: "text", nullable: false),
                    embedding = table.Column<Vector>(type: "vector(1536)", nullable: true),
                    token_count = table.Column<int>(type: "integer", nullable: false),
                    char_start = table.Column<int>(type: "integer", nullable: false),
                    char_end = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_chapter_chunk", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_chapter_chunk_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_chapter_chunk_user_chapters_user_chapter_id",
                        column: x => x.user_chapter_id,
                        principalTable: "user_chapters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_user_chapter_chunk_embedding",
                table: "user_chapter_chunk",
                column: "embedding")
                .Annotation("Npgsql:IndexMethod", "hnsw")
                .Annotation("Npgsql:IndexOperators", new[] { "vector_cosine_ops" });

            migrationBuilder.CreateIndex(
                name: "ix_user_chapter_chunk_user_book_id_user_chapter_id_ord",
                table: "user_chapter_chunk",
                columns: new[] { "user_book_id", "user_chapter_id", "ord" });

            migrationBuilder.CreateIndex(
                name: "ix_user_chapter_chunk_user_chapter_id",
                table: "user_chapter_chunk",
                column: "user_chapter_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_chapter_chunk_user_id_user_book_id",
                table: "user_chapter_chunk",
                columns: new[] { "user_id", "user_book_id" });

            // Lexical branch for hybrid retrieval (mirrors chapter_chunk.search_vector). Generated
            // column stays out of the EF model — retrieval is hand-written Npgsql. 'english' is a
            // constant (generated columns require an immutable expression).
            migrationBuilder.Sql(@"
                ALTER TABLE user_chapter_chunk
                ADD COLUMN IF NOT EXISTS search_vector tsvector
                GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS ix_user_chapter_chunk_search_vector
                ON user_chapter_chunk USING GIN (search_vector);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_user_chapter_chunk_search_vector;");

            migrationBuilder.DropTable(
                name: "user_chapter_chunk");

            migrationBuilder.DropColumn(
                name: "rag_chunk_count",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "rag_embedded_count",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "rag_error",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "rag_indexed_at",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "rag_status",
                table: "user_books");
        }
    }
}
