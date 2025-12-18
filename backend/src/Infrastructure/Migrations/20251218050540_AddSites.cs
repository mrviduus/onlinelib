using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSites : Migration
    {
        // Seed site IDs (deterministic for backfill)
        private static readonly Guid FictionSiteId = new("11111111-1111-1111-1111-111111111111");
        private static readonly Guid ProgrammingSiteId = new("22222222-2222-2222-2222-222222222222");

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Create sites table
            migrationBuilder.CreateTable(
                name: "sites",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    primary_domain = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    default_language = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    theme = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ads_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    indexing_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    sitemap_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    features_json = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sites", x => x.id);
                });

            // 2. Create site_domains table
            migrationBuilder.CreateTable(
                name: "site_domains",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    domain = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_site_domains", x => x.id);
                    table.ForeignKey(
                        name: "fk_site_domains_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            // 3. Seed initial sites
            var now = DateTimeOffset.UtcNow;
            migrationBuilder.InsertData(
                table: "sites",
                columns: new[] { "id", "code", "primary_domain", "default_language", "theme", "ads_enabled", "indexing_enabled", "sitemap_enabled", "features_json", "created_at", "updated_at" },
                values: new object[] { FictionSiteId, "fiction", "fiction.localhost", "en", "fiction", false, false, true, "{}", now, now });

            migrationBuilder.InsertData(
                table: "sites",
                columns: new[] { "id", "code", "primary_domain", "default_language", "theme", "ads_enabled", "indexing_enabled", "sitemap_enabled", "features_json", "created_at", "updated_at" },
                values: new object[] { ProgrammingSiteId, "programming", "programming.localhost", "en", "programming", false, false, true, "{}", now, now });

            // 4. Seed site domains
            migrationBuilder.InsertData(
                table: "site_domains",
                columns: new[] { "id", "site_id", "domain", "is_primary", "created_at" },
                values: new object[] { Guid.NewGuid(), FictionSiteId, "fiction.localhost", true, now });

            migrationBuilder.InsertData(
                table: "site_domains",
                columns: new[] { "id", "site_id", "domain", "is_primary", "created_at" },
                values: new object[] { Guid.NewGuid(), FictionSiteId, "localhost", false, now });

            migrationBuilder.InsertData(
                table: "site_domains",
                columns: new[] { "id", "site_id", "domain", "is_primary", "created_at" },
                values: new object[] { Guid.NewGuid(), ProgrammingSiteId, "programming.localhost", true, now });

            // 5. Drop old unique index on works.slug
            migrationBuilder.DropIndex(
                name: "ix_works_slug",
                table: "works");

            // 6. Add site_id column (nullable first)
            migrationBuilder.AddColumn<Guid>(
                name: "site_id",
                table: "works",
                type: "uuid",
                nullable: true);

            // 7. Backfill existing works to fiction site
            migrationBuilder.Sql($"UPDATE works SET site_id = '{FictionSiteId}' WHERE site_id IS NULL");

            // 8. Make site_id NOT NULL
            migrationBuilder.AlterColumn<Guid>(
                name: "site_id",
                table: "works",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            // 9. Add indexes
            migrationBuilder.CreateIndex(
                name: "ix_works_site_id",
                table: "works",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_works_site_id_slug",
                table: "works",
                columns: new[] { "site_id", "slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_site_domains_domain",
                table: "site_domains",
                column: "domain",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_site_domains_site_id",
                table: "site_domains",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_sites_code",
                table: "sites",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sites_primary_domain",
                table: "sites",
                column: "primary_domain",
                unique: true);

            // 10. Add FK constraint
            migrationBuilder.AddForeignKey(
                name: "fk_works_sites_site_id",
                table: "works",
                column: "site_id",
                principalTable: "sites",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_works_sites_site_id",
                table: "works");

            migrationBuilder.DropTable(
                name: "site_domains");

            migrationBuilder.DropTable(
                name: "sites");

            migrationBuilder.DropIndex(
                name: "ix_works_site_id",
                table: "works");

            migrationBuilder.DropIndex(
                name: "ix_works_site_id_slug",
                table: "works");

            migrationBuilder.DropColumn(
                name: "site_id",
                table: "works");

            migrationBuilder.CreateIndex(
                name: "ix_works_slug",
                table: "works",
                column: "slug",
                unique: true);
        }
    }
}
