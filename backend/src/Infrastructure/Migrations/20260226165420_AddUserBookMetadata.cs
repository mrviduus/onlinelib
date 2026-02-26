using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBookMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "author",
                table: "user_books",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "genre",
                table: "user_books",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "published_year",
                table: "user_books",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "total_word_count",
                table: "user_books",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "author",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "genre",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "published_year",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "total_word_count",
                table: "user_books");
        }
    }
}
