using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameFictionToGeneral : Migration
    {
        private static readonly Guid GeneralSiteId = new("11111111-1111-1111-1111-111111111111");

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Update site: fiction -> general
            migrationBuilder.Sql($@"
                UPDATE sites
                SET code = 'general',
                    primary_domain = 'general.localhost',
                    theme = 'general',
                    updated_at = NOW()
                WHERE id = '{GeneralSiteId}'
            ");

            // Update primary domain in site_domains
            migrationBuilder.Sql($@"
                UPDATE site_domains
                SET domain = 'general.localhost'
                WHERE site_id = '{GeneralSiteId}' AND domain = 'fiction.localhost'
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revert site: general -> fiction
            migrationBuilder.Sql($@"
                UPDATE sites
                SET code = 'fiction',
                    primary_domain = 'fiction.localhost',
                    theme = 'fiction',
                    updated_at = NOW()
                WHERE id = '{GeneralSiteId}'
            ");

            // Revert primary domain
            migrationBuilder.Sql($@"
                UPDATE site_domains
                SET domain = 'fiction.localhost'
                WHERE site_id = '{GeneralSiteId}' AND domain = 'general.localhost'
            ");
        }
    }
}
