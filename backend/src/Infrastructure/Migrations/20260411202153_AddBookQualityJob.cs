using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBookQualityJob : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "book_quality_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    issues_json = table.Column<string>(type: "jsonb", nullable: true),
                    issues_found = table.Column<int>(type: "integer", nullable: true),
                    issues_fixed = table.Column<int>(type: "integer", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    log_output = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_book_quality_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_book_quality_jobs_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_book_quality_jobs_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_book_quality_jobs_edition_id",
                table: "book_quality_jobs",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_book_quality_jobs_status",
                table: "book_quality_jobs",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_book_quality_jobs_user_book_id",
                table: "book_quality_jobs",
                column: "user_book_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "book_quality_jobs");
        }
    }
}
