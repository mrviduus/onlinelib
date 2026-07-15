using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChunkIsSummary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_summary",
                table: "user_chapter_chunk",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_summary",
                table: "chapter_chunk",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "ix_user_chapter_chunk_summary",
                table: "user_chapter_chunk",
                columns: new[] { "user_id", "user_book_id", "chapter_ord" },
                filter: "is_summary");

            migrationBuilder.CreateIndex(
                name: "ix_chapter_chunk_summary",
                table: "chapter_chunk",
                columns: new[] { "edition_id", "chapter_ord" },
                filter: "is_summary");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_user_chapter_chunk_summary",
                table: "user_chapter_chunk");

            migrationBuilder.DropIndex(
                name: "ix_chapter_chunk_summary",
                table: "chapter_chunk");

            migrationBuilder.DropColumn(
                name: "is_summary",
                table: "user_chapter_chunk");

            migrationBuilder.DropColumn(
                name: "is_summary",
                table: "chapter_chunk");
        }
    }
}
