using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSiteIdToUserReading : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Drop old indexes
            migrationBuilder.DropIndex(
                name: "ix_reading_progresses_user_id_edition_id",
                table: "reading_progresses");

            migrationBuilder.DropIndex(
                name: "ix_notes_user_id_edition_id",
                table: "notes");

            migrationBuilder.DropIndex(
                name: "ix_bookmarks_user_id_edition_id",
                table: "bookmarks");

            // 2. Add site_id columns (nullable first)
            migrationBuilder.AddColumn<Guid>(
                name: "site_id",
                table: "reading_progresses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "site_id",
                table: "notes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "site_id",
                table: "bookmarks",
                type: "uuid",
                nullable: true);

            // 3. Backfill from edition.site_id
            migrationBuilder.Sql(@"
                UPDATE reading_progresses rp
                SET site_id = e.site_id
                FROM editions e
                WHERE rp.edition_id = e.id AND rp.site_id IS NULL
            ");

            migrationBuilder.Sql(@"
                UPDATE notes n
                SET site_id = e.site_id
                FROM editions e
                WHERE n.edition_id = e.id AND n.site_id IS NULL
            ");

            migrationBuilder.Sql(@"
                UPDATE bookmarks b
                SET site_id = e.site_id
                FROM editions e
                WHERE b.edition_id = e.id AND b.site_id IS NULL
            ");

            // 4. Make NOT NULL
            migrationBuilder.AlterColumn<Guid>(
                name: "site_id",
                table: "reading_progresses",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "site_id",
                table: "notes",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "site_id",
                table: "bookmarks",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            // 5. Create indexes
            migrationBuilder.CreateIndex(
                name: "ix_reading_progresses_site_id",
                table: "reading_progresses",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_progresses_user_id_site_id_edition_id",
                table: "reading_progresses",
                columns: new[] { "user_id", "site_id", "edition_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notes_site_id",
                table: "notes",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_notes_user_id_site_id_edition_id",
                table: "notes",
                columns: new[] { "user_id", "site_id", "edition_id" });

            migrationBuilder.CreateIndex(
                name: "ix_bookmarks_site_id",
                table: "bookmarks",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_bookmarks_user_id_site_id_edition_id",
                table: "bookmarks",
                columns: new[] { "user_id", "site_id", "edition_id" });

            // 6. Add FKs
            migrationBuilder.AddForeignKey(
                name: "fk_bookmarks_sites_site_id",
                table: "bookmarks",
                column: "site_id",
                principalTable: "sites",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_notes_sites_site_id",
                table: "notes",
                column: "site_id",
                principalTable: "sites",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_reading_progresses_sites_site_id",
                table: "reading_progresses",
                column: "site_id",
                principalTable: "sites",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_bookmarks_sites_site_id",
                table: "bookmarks");

            migrationBuilder.DropForeignKey(
                name: "fk_notes_sites_site_id",
                table: "notes");

            migrationBuilder.DropForeignKey(
                name: "fk_reading_progresses_sites_site_id",
                table: "reading_progresses");

            migrationBuilder.DropIndex(
                name: "ix_reading_progresses_site_id",
                table: "reading_progresses");

            migrationBuilder.DropIndex(
                name: "ix_reading_progresses_user_id_site_id_edition_id",
                table: "reading_progresses");

            migrationBuilder.DropIndex(
                name: "ix_notes_site_id",
                table: "notes");

            migrationBuilder.DropIndex(
                name: "ix_notes_user_id_site_id_edition_id",
                table: "notes");

            migrationBuilder.DropIndex(
                name: "ix_bookmarks_site_id",
                table: "bookmarks");

            migrationBuilder.DropIndex(
                name: "ix_bookmarks_user_id_site_id_edition_id",
                table: "bookmarks");

            migrationBuilder.DropColumn(
                name: "site_id",
                table: "reading_progresses");

            migrationBuilder.DropColumn(
                name: "site_id",
                table: "notes");

            migrationBuilder.DropColumn(
                name: "site_id",
                table: "bookmarks");

            migrationBuilder.CreateIndex(
                name: "ix_reading_progresses_user_id_edition_id",
                table: "reading_progresses",
                columns: new[] { "user_id", "edition_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notes_user_id_edition_id",
                table: "notes",
                columns: new[] { "user_id", "edition_id" });

            migrationBuilder.CreateIndex(
                name: "ix_bookmarks_user_id_edition_id",
                table: "bookmarks",
                columns: new[] { "user_id", "edition_id" });
        }
    }
}
