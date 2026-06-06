using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPodcastGenerationJob : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "podcast_generation_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lang = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    script_json = table.Column<string>(type: "jsonb", nullable: true),
                    audio_path = table.Column<string>(type: "text", nullable: true),
                    duration_seconds = table.Column<int>(type: "integer", nullable: true),
                    cost_usd = table.Column<decimal>(type: "numeric(10,6)", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_podcast_generation_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_podcast_generation_jobs_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_podcast_generation_jobs_edition_id",
                table: "podcast_generation_jobs",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_podcast_generation_jobs_status",
                table: "podcast_generation_jobs",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "podcast_generation_jobs");
        }
    }
}
