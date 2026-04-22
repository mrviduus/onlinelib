using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropBlog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Orphaned SEO templates/jobs targeting BlogPost (entity_type = 3) — enum value removed.
            migrationBuilder.Sql("DELETE FROM seo_backfill_jobs WHERE entity_type = 3;");
            migrationBuilder.Sql("DELETE FROM seo_templates WHERE entity_type = 3;");

            migrationBuilder.DropTable(
                name: "blog_comments");

            migrationBuilder.DropTable(
                name: "blog_likes");

            migrationBuilder.DropTable(
                name: "blog_posts");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "blog_posts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    comment_count = table.Column<int>(type: "integer", nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    cover_image_path = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    excerpt = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    like_count = table.Column<int>(type: "integer", nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    seo_description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    seo_source = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    seo_title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    slug = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    tags = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    view_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blog_posts", x => x.id);
                    table.ForeignKey(
                        name: "fk_blog_posts_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "blog_comments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    blog_post_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_comment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blog_comments", x => x.id);
                    table.ForeignKey(
                        name: "fk_blog_comments_blog_comments_parent_comment_id",
                        column: x => x.parent_comment_id,
                        principalTable: "blog_comments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_blog_comments_blog_posts_blog_post_id",
                        column: x => x.blog_post_id,
                        principalTable: "blog_posts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_blog_comments_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_blog_comments_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "blog_likes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    blog_post_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blog_likes", x => x.id);
                    table.ForeignKey(
                        name: "fk_blog_likes_blog_posts_blog_post_id",
                        column: x => x.blog_post_id,
                        principalTable: "blog_posts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_blog_likes_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_blog_likes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_blog_comments_blog_post_id",
                table: "blog_comments",
                column: "blog_post_id");

            migrationBuilder.CreateIndex(
                name: "ix_blog_comments_parent_comment_id",
                table: "blog_comments",
                column: "parent_comment_id");

            migrationBuilder.CreateIndex(
                name: "ix_blog_comments_site_id",
                table: "blog_comments",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_blog_comments_user_id_site_id",
                table: "blog_comments",
                columns: new[] { "user_id", "site_id" });

            migrationBuilder.CreateIndex(
                name: "ix_blog_likes_blog_post_id",
                table: "blog_likes",
                column: "blog_post_id");

            migrationBuilder.CreateIndex(
                name: "ix_blog_likes_blog_post_id_user_id",
                table: "blog_likes",
                columns: new[] { "blog_post_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_blog_likes_site_id",
                table: "blog_likes",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_blog_likes_user_id",
                table: "blog_likes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_blog_posts_site_id_language_slug",
                table: "blog_posts",
                columns: new[] { "site_id", "language", "slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_blog_posts_site_id_status_published_at",
                table: "blog_posts",
                columns: new[] { "site_id", "status", "published_at" });
        }
    }
}
