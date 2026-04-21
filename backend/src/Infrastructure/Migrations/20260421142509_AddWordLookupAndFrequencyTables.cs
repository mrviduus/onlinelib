using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWordLookupAndFrequencyTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "word_frequencies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    word = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    rank = table.Column<int>(type: "integer", nullable: false),
                    zipf = table.Column<double>(type: "double precision", nullable: false),
                    pos = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_word_frequencies", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "word_lookups",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    word = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    zipf_rank = table.Column<int>(type: "integer", nullable: true),
                    tap_count = table.Column<int>(type: "integer", nullable: false),
                    sentence = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    book_title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    chapter_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    last_translation = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    first_tapped_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_tapped_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_word_lookups", x => x.id);
                    table.ForeignKey(
                        name: "fk_word_lookups_chapters_chapter_id",
                        column: x => x.chapter_id,
                        principalTable: "chapters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_word_lookups_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_word_lookups_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_word_lookups_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_word_lookups_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_word_frequencies_language_rank",
                table: "word_frequencies",
                columns: new[] { "language", "rank" });

            migrationBuilder.CreateIndex(
                name: "ix_word_frequencies_language_word",
                table: "word_frequencies",
                columns: new[] { "language", "word" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_word_lookups_chapter_id",
                table: "word_lookups",
                column: "chapter_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_lookups_edition_id",
                table: "word_lookups",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_lookups_site_id",
                table: "word_lookups",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_lookups_user_book_id",
                table: "word_lookups",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_lookups_user_id_site_id_last_tapped_at",
                table: "word_lookups",
                columns: new[] { "user_id", "site_id", "last_tapped_at" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "ix_word_lookups_user_id_site_id_word_language",
                table: "word_lookups",
                columns: new[] { "user_id", "site_id", "word", "language" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "word_frequencies");

            migrationBuilder.DropTable(
                name: "word_lookups");
        }
    }
}
