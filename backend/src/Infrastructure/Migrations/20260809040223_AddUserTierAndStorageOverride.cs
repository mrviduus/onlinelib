using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserTierAndStorageOverride : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "storage_limit_override_bytes",
                table: "users",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tier",
                table: "users",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Free");

            // Backfill. The column default is Free, which is right for every registered account but
            // WRONG for existing guests — without this they would silently jump from a 50 MB to a
            // 500 MB allowance the moment this deploys. IsGuest stays the source of truth for the
            // guest lifecycle (cleanup, promotion); tier just has to agree with it at rest.
            migrationBuilder.Sql("UPDATE users SET tier = 'Guest' WHERE is_guest = true;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "storage_limit_override_bytes",
                table: "users");

            migrationBuilder.DropColumn(
                name: "tier",
                table: "users");
        }
    }
}
