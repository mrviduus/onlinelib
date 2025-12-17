using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Add_UserLibrary_UserFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_users_external_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "external_id",
                table: "users");

            migrationBuilder.AddColumn<string>(
                name: "email",
                table: "users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "google_subject",
                table: "users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "name",
                table: "users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "user_libraries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_libraries", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_libraries_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_libraries_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_google_subject",
                table: "users",
                column: "google_subject",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_libraries_edition_id",
                table: "user_libraries",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_libraries_user_id_edition_id",
                table: "user_libraries",
                columns: new[] { "user_id", "edition_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_libraries");

            migrationBuilder.DropIndex(
                name: "ix_users_email",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ix_users_google_subject",
                table: "users");

            migrationBuilder.DropColumn(
                name: "email",
                table: "users");

            migrationBuilder.DropColumn(
                name: "google_subject",
                table: "users");

            migrationBuilder.DropColumn(
                name: "name",
                table: "users");

            migrationBuilder.AddColumn<string>(
                name: "external_id",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_external_id",
                table: "users",
                column: "external_id",
                unique: true,
                filter: "external_id IS NOT NULL");
        }
    }
}
