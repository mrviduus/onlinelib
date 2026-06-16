using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDeviceAuthorization : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "device_authorizations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_code_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    user_code = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    interval_seconds = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_device_authorizations", x => x.id);
                    table.ForeignKey(
                        name: "fk_device_authorizations_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_device_authorizations_device_code_hash",
                table: "device_authorizations",
                column: "device_code_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_device_authorizations_expires_at",
                table: "device_authorizations",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "ix_device_authorizations_user_code",
                table: "device_authorizations",
                column: "user_code",
                filter: "status = 'pending'");

            migrationBuilder.CreateIndex(
                name: "ix_device_authorizations_user_id",
                table: "device_authorizations",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "device_authorizations");
        }
    }
}
