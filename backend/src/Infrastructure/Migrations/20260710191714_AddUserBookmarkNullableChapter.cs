using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBookmarkNullableChapter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_user_book_bookmarks_user_chapters_chapter_id",
                table: "user_book_bookmarks");

            migrationBuilder.AlterColumn<Guid>(
                name: "chapter_id",
                table: "user_book_bookmarks",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddForeignKey(
                name: "fk_user_book_bookmarks_user_chapters_chapter_id",
                table: "user_book_bookmarks",
                column: "chapter_id",
                principalTable: "user_chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_user_book_bookmarks_user_chapters_chapter_id",
                table: "user_book_bookmarks");

            migrationBuilder.AlterColumn<Guid>(
                name: "chapter_id",
                table: "user_book_bookmarks",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "fk_user_book_bookmarks_user_chapters_chapter_id",
                table: "user_book_bookmarks",
                column: "chapter_id",
                principalTable: "user_chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
