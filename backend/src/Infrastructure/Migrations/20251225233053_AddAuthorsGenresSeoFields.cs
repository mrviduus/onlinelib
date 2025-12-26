using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthorsGenresSeoFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "canonical_override",
                table: "editions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "indexable",
                table: "editions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "seo_description",
                table: "editions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "seo_title",
                table: "editions",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "authors",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    slug = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    bio = table.Column<string>(type: "text", nullable: true),
                    photo_path = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    indexable = table.Column<bool>(type: "boolean", nullable: false),
                    seo_title = table.Column<string>(type: "text", nullable: true),
                    seo_description = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_authors", x => x.id);
                    table.ForeignKey(
                        name: "fk_authors_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "genres",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    slug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    indexable = table.Column<bool>(type: "boolean", nullable: false),
                    seo_title = table.Column<string>(type: "text", nullable: true),
                    seo_description = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_genres", x => x.id);
                    table.ForeignKey(
                        name: "fk_genres_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "edition_authors",
                columns: table => new
                {
                    authors_id = table.Column<Guid>(type: "uuid", nullable: false),
                    editions_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_edition_authors", x => new { x.authors_id, x.editions_id });
                    table.ForeignKey(
                        name: "fk_edition_authors_authors_authors_id",
                        column: x => x.authors_id,
                        principalTable: "authors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_edition_authors_editions_editions_id",
                        column: x => x.editions_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "edition_genres",
                columns: table => new
                {
                    editions_id = table.Column<Guid>(type: "uuid", nullable: false),
                    genres_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_edition_genres", x => new { x.editions_id, x.genres_id });
                    table.ForeignKey(
                        name: "fk_edition_genres_editions_editions_id",
                        column: x => x.editions_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_edition_genres_genres_genres_id",
                        column: x => x.genres_id,
                        principalTable: "genres",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_authors_site_id",
                table: "authors",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_authors_site_id_slug",
                table: "authors",
                columns: new[] { "site_id", "slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_edition_authors_editions_id",
                table: "edition_authors",
                column: "editions_id");

            migrationBuilder.CreateIndex(
                name: "ix_edition_genres_genres_id",
                table: "edition_genres",
                column: "genres_id");

            migrationBuilder.CreateIndex(
                name: "ix_genres_site_id",
                table: "genres",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_genres_site_id_slug",
                table: "genres",
                columns: new[] { "site_id", "slug" },
                unique: true);

            // Migrate AuthorsJson to Authors table
            migrationBuilder.Sql(@"
                -- Create authors from editions.authors_json
                INSERT INTO authors (id, site_id, slug, name, created_at, updated_at, indexable)
                SELECT DISTINCT ON (e.site_id, lower(author_name))
                    gen_random_uuid(),
                    e.site_id,
                    regexp_replace(lower(trim(author_name)), '[^a-z0-9\u0430-\u044f\u0410-\u042f]+', '-', 'g'),
                    trim(author_name),
                    NOW(),
                    NOW(),
                    true
                FROM editions e
                CROSS JOIN LATERAL jsonb_array_elements_text(
                    CASE
                        WHEN e.authors_json IS NOT NULL AND e.authors_json != ''
                        THEN e.authors_json::jsonb
                        ELSE '[]'::jsonb
                    END
                ) AS author_name
                WHERE e.authors_json IS NOT NULL AND e.authors_json != '' AND e.authors_json != '[]';

                -- Link editions to authors
                INSERT INTO edition_authors (authors_id, editions_id)
                SELECT a.id, e.id
                FROM editions e
                CROSS JOIN LATERAL jsonb_array_elements_text(
                    CASE
                        WHEN e.authors_json IS NOT NULL AND e.authors_json != ''
                        THEN e.authors_json::jsonb
                        ELSE '[]'::jsonb
                    END
                ) AS author_name
                INNER JOIN authors a ON a.site_id = e.site_id AND lower(a.name) = lower(trim(author_name))
                WHERE e.authors_json IS NOT NULL AND e.authors_json != '' AND e.authors_json != '[]';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "edition_authors");

            migrationBuilder.DropTable(
                name: "edition_genres");

            migrationBuilder.DropTable(
                name: "authors");

            migrationBuilder.DropTable(
                name: "genres");

            migrationBuilder.DropColumn(
                name: "canonical_override",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "indexable",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "seo_description",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "seo_title",
                table: "editions");
        }
    }
}
