using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddIngestionJobDiagnostics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "confidence",
                table: "ingestion_jobs",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "source_format",
                table: "ingestion_jobs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "text_source",
                table: "ingestion_jobs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "units_count",
                table: "ingestion_jobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "warnings_json",
                table: "ingestion_jobs",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "confidence",
                table: "ingestion_jobs");

            migrationBuilder.DropColumn(
                name: "source_format",
                table: "ingestion_jobs");

            migrationBuilder.DropColumn(
                name: "text_source",
                table: "ingestion_jobs");

            migrationBuilder.DropColumn(
                name: "units_count",
                table: "ingestion_jobs");

            migrationBuilder.DropColumn(
                name: "warnings_json",
                table: "ingestion_jobs");
        }
    }
}
