using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChapterContentQualityScore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "content_quality_score",
                table: "user_chapters",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "content_quality_score",
                table: "chapters",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "content_chapters_cleaned",
                table: "book_quality_jobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "content_chapters_rejected",
                table: "book_quality_jobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "content_chapters_skipped",
                table: "book_quality_jobs",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "content_quality_score",
                table: "user_chapters");

            migrationBuilder.DropColumn(
                name: "content_quality_score",
                table: "chapters");

            migrationBuilder.DropColumn(
                name: "content_chapters_cleaned",
                table: "book_quality_jobs");

            migrationBuilder.DropColumn(
                name: "content_chapters_rejected",
                table: "book_quality_jobs");

            migrationBuilder.DropColumn(
                name: "content_chapters_skipped",
                table: "book_quality_jobs");
        }
    }
}
