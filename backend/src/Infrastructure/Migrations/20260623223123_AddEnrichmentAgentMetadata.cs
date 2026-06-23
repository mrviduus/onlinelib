using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEnrichmentAgentMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "metadata_confidence",
                table: "user_books",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "metadata_provenance_json",
                table: "user_books",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "confidence",
                table: "agent_run",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "tool_calls_count",
                table: "agent_run",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "metadata_confidence",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "metadata_provenance_json",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "confidence",
                table: "agent_run");

            migrationBuilder.DropColumn(
                name: "tool_calls_count",
                table: "agent_run");
        }
    }
}
