using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEditableUserBookMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "metadata_history_json",
                table: "user_books",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "seo_source",
                table: "user_books",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "auto");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "metadata_history_json",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "seo_source",
                table: "user_books");
        }
    }
}
