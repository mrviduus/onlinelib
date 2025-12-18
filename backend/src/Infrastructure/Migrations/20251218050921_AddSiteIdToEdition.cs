using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSiteIdToEdition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Drop old index
            migrationBuilder.DropIndex(
                name: "ix_editions_slug",
                table: "editions");

            // 2. Add site_id column (nullable first)
            migrationBuilder.AddColumn<Guid>(
                name: "site_id",
                table: "editions",
                type: "uuid",
                nullable: true);

            // 3. Backfill from work.site_id
            migrationBuilder.Sql(@"
                UPDATE editions e
                SET site_id = w.site_id
                FROM works w
                WHERE e.work_id = w.id AND e.site_id IS NULL
            ");

            // 4. Make NOT NULL
            migrationBuilder.AlterColumn<Guid>(
                name: "site_id",
                table: "editions",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            // 5. Add indexes
            migrationBuilder.CreateIndex(
                name: "ix_editions_site_id",
                table: "editions",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_editions_site_id_language_slug",
                table: "editions",
                columns: new[] { "site_id", "language", "slug" },
                unique: true);

            // 6. Add FK
            migrationBuilder.AddForeignKey(
                name: "fk_editions_sites_site_id",
                table: "editions",
                column: "site_id",
                principalTable: "sites",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_editions_sites_site_id",
                table: "editions");

            migrationBuilder.DropIndex(
                name: "ix_editions_site_id",
                table: "editions");

            migrationBuilder.DropIndex(
                name: "ix_editions_site_id_language_slug",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "site_id",
                table: "editions");

            migrationBuilder.CreateIndex(
                name: "ix_editions_slug",
                table: "editions",
                column: "slug");
        }
    }
}
