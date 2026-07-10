using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserChapterChunkProvenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_user_chapter_chunk_user_chapters_user_chapter_id",
                table: "user_chapter_chunk");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_chapter_id",
                table: "user_chapter_chunk",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "section_path",
                table: "user_chapter_chunk",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "source_page",
                table: "user_chapter_chunk",
                type: "integer",
                nullable: true);

            migrationBuilder.AddForeignKey(
                name: "fk_user_chapter_chunk_user_chapters_user_chapter_id",
                table: "user_chapter_chunk",
                column: "user_chapter_id",
                principalTable: "user_chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_user_chapter_chunk_user_chapters_user_chapter_id",
                table: "user_chapter_chunk");

            migrationBuilder.DropColumn(
                name: "section_path",
                table: "user_chapter_chunk");

            migrationBuilder.DropColumn(
                name: "source_page",
                table: "user_chapter_chunk");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_chapter_id",
                table: "user_chapter_chunk",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "fk_user_chapter_chunk_user_chapters_user_chapter_id",
                table: "user_chapter_chunk",
                column: "user_chapter_id",
                principalTable: "user_chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
