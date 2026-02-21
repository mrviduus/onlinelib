using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVocabulary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "vocabulary_words",
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
                    stage = table.Column<int>(type: "integer", nullable: false),
                    interval_days = table.Column<double>(type: "double precision", nullable: false),
                    consecutive_correct = table.Column<int>(type: "integer", nullable: false),
                    next_review_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_reviewed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    total_reviews = table.Column<int>(type: "integer", nullable: false),
                    correct_reviews = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vocabulary_words", x => x.id);
                    table.ForeignKey(
                        name: "fk_vocabulary_words_chapters_chapter_id",
                        column: x => x.chapter_id,
                        principalTable: "chapters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_vocabulary_words_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_vocabulary_words_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_vocabulary_words_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_vocabulary_words_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "vocabulary_reviews",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    vocabulary_word_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    review_mode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    is_correct = table.Column<bool>(type: "boolean", nullable: false),
                    response_time_ms = table.Column<int>(type: "integer", nullable: false),
                    stage_before = table.Column<int>(type: "integer", nullable: false),
                    stage_after = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vocabulary_reviews", x => x.id);
                    table.ForeignKey(
                        name: "fk_vocabulary_reviews_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_vocabulary_reviews_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_vocabulary_reviews_vocabulary_words_vocabulary_word_id",
                        column: x => x.vocabulary_word_id,
                        principalTable: "vocabulary_words",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_reviews_site_id",
                table: "vocabulary_reviews",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_reviews_user_id_site_id_created_at",
                table: "vocabulary_reviews",
                columns: new[] { "user_id", "site_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_reviews_vocabulary_word_id",
                table: "vocabulary_reviews",
                column: "vocabulary_word_id");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_chapter_id",
                table: "vocabulary_words",
                column: "chapter_id");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_edition_id",
                table: "vocabulary_words",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_site_id",
                table: "vocabulary_words",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_user_book_id",
                table: "vocabulary_words",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_user_id_site_id",
                table: "vocabulary_words",
                columns: new[] { "user_id", "site_id" });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_user_id_site_id_next_review_at",
                table: "vocabulary_words",
                columns: new[] { "user_id", "site_id", "next_review_at" });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_user_id_site_id_word_language",
                table: "vocabulary_words",
                columns: new[] { "user_id", "site_id", "word", "language" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "vocabulary_reviews");

            migrationBuilder.DropTable(
                name: "vocabulary_words");
        }
    }
}
