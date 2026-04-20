using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAmbientSocialHighlights : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "highlights",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "deleted_by_user_id",
                table: "highlights",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                table: "highlights",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_public",
                table: "highlights",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "like_count",
                table: "highlights",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "published_at",
                table: "highlights",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "highlight_likes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    highlight_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_highlight_likes", x => x.id);
                    table.ForeignKey(
                        name: "fk_highlight_likes_highlights_highlight_id",
                        column: x => x.highlight_id,
                        principalTable: "highlights",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_highlight_likes_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_highlight_likes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "highlight_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    highlight_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reported_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reason = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    resolved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    resolved_by_admin_id = table.Column<Guid>(type: "uuid", nullable: true),
                    resolution = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_highlight_reports", x => x.id);
                    table.ForeignKey(
                        name: "fk_highlight_reports_highlights_highlight_id",
                        column: x => x.highlight_id,
                        principalTable: "highlights",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_highlight_reports_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_highlight_reports_users_reported_by_user_id",
                        column: x => x.reported_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_highlights_public_per_chapter",
                table: "highlights",
                columns: new[] { "edition_id", "chapter_id", "is_public", "is_deleted" },
                filter: "is_public = true AND is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_likes_highlight_id",
                table: "highlight_likes",
                column: "highlight_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_likes_highlight_id_user_id",
                table: "highlight_likes",
                columns: new[] { "highlight_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_highlight_likes_site_id",
                table: "highlight_likes",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_likes_user_id",
                table: "highlight_likes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_reports_highlight_id",
                table: "highlight_reports",
                column: "highlight_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_reports_reported_by_user_id",
                table: "highlight_reports",
                column: "reported_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_reports_resolved_at",
                table: "highlight_reports",
                column: "resolved_at");

            migrationBuilder.CreateIndex(
                name: "ix_highlight_reports_site_id",
                table: "highlight_reports",
                column: "site_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "highlight_likes");

            migrationBuilder.DropTable(
                name: "highlight_reports");

            migrationBuilder.DropIndex(
                name: "ix_highlights_public_per_chapter",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "deleted_by_user_id",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "is_public",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "like_count",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "published_at",
                table: "highlights");
        }
    }
}
