using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWordClusterTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "word_clusters",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    theme = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    book_title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    member_count = table.Column<int>(type: "integer", nullable: false),
                    cohesion_score = table.Column<double>(type: "double precision", nullable: false),
                    is_confirmed = table.Column<bool>(type: "boolean", nullable: false),
                    is_dismissed = table.Column<bool>(type: "boolean", nullable: false),
                    dismissed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_word_clusters", x => x.id);
                    table.ForeignKey(
                        name: "fk_word_clusters_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_word_clusters_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_word_clusters_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_word_clusters_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_cluster_id",
                table: "vocabulary_words",
                column: "cluster_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_clusters_edition_id",
                table: "word_clusters",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_clusters_site_id",
                table: "word_clusters",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_clusters_user_book_id",
                table: "word_clusters",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_word_clusters_user_id_site_id_is_dismissed_created_at",
                table: "word_clusters",
                columns: new[] { "user_id", "site_id", "is_dismissed", "created_at" },
                descending: new[] { false, false, false, true });

            migrationBuilder.AddForeignKey(
                name: "fk_vocabulary_words_word_clusters_cluster_id",
                table: "vocabulary_words",
                column: "cluster_id",
                principalTable: "word_clusters",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_vocabulary_words_word_clusters_cluster_id",
                table: "vocabulary_words");

            migrationBuilder.DropTable(
                name: "word_clusters");

            migrationBuilder.DropIndex(
                name: "ix_vocabulary_words_cluster_id",
                table: "vocabulary_words");
        }
    }
}
