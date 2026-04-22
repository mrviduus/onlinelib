using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "review_comments");

            migrationBuilder.DropTable(
                name: "review_likes");

            migrationBuilder.DropTable(
                name: "user_ratings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_ratings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    helpful_count = table.Column<int>(type: "integer", nullable: false),
                    is_spoiler = table.Column<bool>(type: "boolean", nullable: false),
                    rating = table.Column<double>(type: "double precision", nullable: false),
                    review_text = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_ratings", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_ratings_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_user_ratings_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_ratings_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_user_ratings_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "review_comments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_rating_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_review_comments", x => x.id);
                    table.ForeignKey(
                        name: "fk_review_comments_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_review_comments_user_ratings_user_rating_id",
                        column: x => x.user_rating_id,
                        principalTable: "user_ratings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_review_comments_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "review_likes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_rating_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_review_likes", x => x.id);
                    table.ForeignKey(
                        name: "fk_review_likes_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_review_likes_user_ratings_user_rating_id",
                        column: x => x.user_rating_id,
                        principalTable: "user_ratings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_review_likes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_review_comments_site_id",
                table: "review_comments",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_review_comments_user_id_site_id",
                table: "review_comments",
                columns: new[] { "user_id", "site_id" });

            migrationBuilder.CreateIndex(
                name: "ix_review_comments_user_rating_id",
                table: "review_comments",
                column: "user_rating_id");

            migrationBuilder.CreateIndex(
                name: "ix_review_likes_site_id",
                table: "review_likes",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_review_likes_user_id",
                table: "review_likes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_review_likes_user_rating_id",
                table: "review_likes",
                column: "user_rating_id");

            migrationBuilder.CreateIndex(
                name: "ix_review_likes_user_rating_id_user_id",
                table: "review_likes",
                columns: new[] { "user_rating_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_edition_id",
                table: "user_ratings",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_edition_id_helpful_count",
                table: "user_ratings",
                columns: new[] { "edition_id", "helpful_count" });

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_site_id",
                table: "user_ratings",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_book_id",
                table: "user_ratings",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_id_site_id_edition_id",
                table: "user_ratings",
                columns: new[] { "user_id", "site_id", "edition_id" },
                unique: true,
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_id_site_id_user_book_id",
                table: "user_ratings",
                columns: new[] { "user_id", "site_id", "user_book_id" },
                unique: true,
                filter: "user_book_id IS NOT NULL");
        }
    }
}
