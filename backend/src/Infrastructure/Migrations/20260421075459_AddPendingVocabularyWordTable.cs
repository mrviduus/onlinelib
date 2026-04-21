using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPendingVocabularyWordTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "pending_vocabulary_words",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    word = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    translation = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    definition = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    chapter_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sentence = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    book_title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    zipf_rank = table.Column<int>(type: "integer", nullable: true),
                    zipf_score = table.Column<double>(type: "double precision", nullable: true),
                    priority = table.Column<double>(type: "double precision", nullable: false),
                    source = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pending_vocabulary_words", x => x.id);
                    table.ForeignKey(
                        name: "fk_pending_vocabulary_words_chapters_chapter_id",
                        column: x => x.chapter_id,
                        principalTable: "chapters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_pending_vocabulary_words_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_pending_vocabulary_words_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_pending_vocabulary_words_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_pending_vocabulary_words_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_chapter_id",
                table: "pending_vocabulary_words",
                column: "chapter_id");

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_edition_id",
                table: "pending_vocabulary_words",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_site_id",
                table: "pending_vocabulary_words",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_user_book_id",
                table: "pending_vocabulary_words",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_user_id_site_id_created_at",
                table: "pending_vocabulary_words",
                columns: new[] { "user_id", "site_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_user_id_site_id_priority",
                table: "pending_vocabulary_words",
                columns: new[] { "user_id", "site_id", "priority" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "ix_pending_vocabulary_words_user_id_site_id_word_language",
                table: "pending_vocabulary_words",
                columns: new[] { "user_id", "site_id", "word", "language" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "pending_vocabulary_words");
        }
    }
}
