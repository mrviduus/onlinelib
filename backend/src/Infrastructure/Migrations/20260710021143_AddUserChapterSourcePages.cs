using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserChapterSourcePages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "source_end_page",
                table: "user_chapters",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "source_start_page",
                table: "user_chapters",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "source_end_page",
                table: "user_chapters");

            migrationBuilder.DropColumn(
                name: "source_start_page",
                table: "user_chapters");
        }
    }
}
