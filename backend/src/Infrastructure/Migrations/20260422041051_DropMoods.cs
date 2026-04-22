using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropMoods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_mood_tags");

            migrationBuilder.DropTable(
                name: "moods");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "moods",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    emoji = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    slug = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_moods", x => x.id);
                    table.ForeignKey(
                        name: "fk_moods_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_mood_tags",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    mood_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_mood_tags", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_mood_tags_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_user_mood_tags_moods_mood_id",
                        column: x => x.mood_id,
                        principalTable: "moods",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_mood_tags_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_mood_tags_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_user_mood_tags_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_moods_site_id_slug",
                table: "moods",
                columns: new[] { "site_id", "slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_edition_id",
                table: "user_mood_tags",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_mood_id",
                table: "user_mood_tags",
                column: "mood_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_site_id",
                table: "user_mood_tags",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_book_id",
                table: "user_mood_tags",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_edition_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "edition_id" },
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_edition_id_mood_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "edition_id", "mood_id" },
                unique: true,
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_user_book_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "user_book_id" },
                filter: "user_book_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_user_book_id_mood_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "user_book_id", "mood_id" },
                unique: true,
                filter: "user_book_id IS NOT NULL");
        }
    }
}
