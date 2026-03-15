using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBookSupportToHighlightsRatingsMoods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_highlights_chapters_chapter_id",
                table: "highlights");

            migrationBuilder.DropForeignKey(
                name: "fk_highlights_editions_edition_id",
                table: "highlights");

            migrationBuilder.DropForeignKey(
                name: "fk_user_mood_tags_editions_edition_id",
                table: "user_mood_tags");

            migrationBuilder.DropForeignKey(
                name: "fk_user_ratings_editions_edition_id",
                table: "user_ratings");

            migrationBuilder.DropIndex(
                name: "ix_user_ratings_user_id_site_id_edition_id",
                table: "user_ratings");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_id_edition_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_id_edition_id_mood_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_highlights_user_id_site_id_edition_id",
                table: "highlights");

            migrationBuilder.AlterColumn<Guid>(
                name: "edition_id",
                table: "user_ratings",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "user_book_id",
                table: "user_ratings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "edition_id",
                table: "user_mood_tags",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "user_book_id",
                table: "user_mood_tags",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "edition_id",
                table: "highlights",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "chapter_id",
                table: "highlights",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_reviewed_at",
                table: "highlights",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "user_book_id",
                table: "highlights",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "user_chapter_id",
                table: "highlights",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_book_id",
                table: "user_ratings",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_id_site_id_edition_id",
                table: "user_ratings",
                columns: new[] { "user_id", "site_id", "edition_id" },
                unique: true,
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_id_site_id_user_book_id",
                table: "user_ratings",
                columns: new[] { "user_id", "site_id", "user_book_id" },
                unique: true,
                filter: "user_book_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_book_id",
                table: "user_mood_tags",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_edition_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "edition_id" },
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_edition_id_mood_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "edition_id", "mood_id" },
                unique: true,
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_user_book_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "user_book_id" },
                filter: "user_book_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_user_book_id_mood_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "user_book_id", "mood_id" },
                unique: true,
                filter: "user_book_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_highlights_user_book_id",
                table: "highlights",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlights_user_chapter_id",
                table: "highlights",
                column: "user_chapter_id");

            migrationBuilder.CreateIndex(
                name: "ix_highlights_user_id_site_id_edition_id",
                table: "highlights",
                columns: new[] { "user_id", "site_id", "edition_id" },
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_highlights_user_id_site_id_user_book_id",
                table: "highlights",
                columns: new[] { "user_id", "site_id", "user_book_id" },
                filter: "user_book_id IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "fk_highlights_chapters_chapter_id",
                table: "highlights",
                column: "chapter_id",
                principalTable: "chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_highlights_editions_edition_id",
                table: "highlights",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_highlights_user_books_user_book_id",
                table: "highlights",
                column: "user_book_id",
                principalTable: "user_books",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_highlights_user_chapters_user_chapter_id",
                table: "highlights",
                column: "user_chapter_id",
                principalTable: "user_chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_user_mood_tags_editions_edition_id",
                table: "user_mood_tags",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_user_mood_tags_user_books_user_book_id",
                table: "user_mood_tags",
                column: "user_book_id",
                principalTable: "user_books",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_user_ratings_editions_edition_id",
                table: "user_ratings",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_user_ratings_user_books_user_book_id",
                table: "user_ratings",
                column: "user_book_id",
                principalTable: "user_books",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_highlights_chapters_chapter_id",
                table: "highlights");

            migrationBuilder.DropForeignKey(
                name: "fk_highlights_editions_edition_id",
                table: "highlights");

            migrationBuilder.DropForeignKey(
                name: "fk_highlights_user_books_user_book_id",
                table: "highlights");

            migrationBuilder.DropForeignKey(
                name: "fk_highlights_user_chapters_user_chapter_id",
                table: "highlights");

            migrationBuilder.DropForeignKey(
                name: "fk_user_mood_tags_editions_edition_id",
                table: "user_mood_tags");

            migrationBuilder.DropForeignKey(
                name: "fk_user_mood_tags_user_books_user_book_id",
                table: "user_mood_tags");

            migrationBuilder.DropForeignKey(
                name: "fk_user_ratings_editions_edition_id",
                table: "user_ratings");

            migrationBuilder.DropForeignKey(
                name: "fk_user_ratings_user_books_user_book_id",
                table: "user_ratings");

            migrationBuilder.DropIndex(
                name: "ix_user_ratings_user_book_id",
                table: "user_ratings");

            migrationBuilder.DropIndex(
                name: "ix_user_ratings_user_id_site_id_edition_id",
                table: "user_ratings");

            migrationBuilder.DropIndex(
                name: "ix_user_ratings_user_id_site_id_user_book_id",
                table: "user_ratings");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_book_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_id_edition_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_id_edition_id_mood_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_id_user_book_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_user_mood_tags_user_id_user_book_id_mood_id",
                table: "user_mood_tags");

            migrationBuilder.DropIndex(
                name: "ix_highlights_user_book_id",
                table: "highlights");

            migrationBuilder.DropIndex(
                name: "ix_highlights_user_chapter_id",
                table: "highlights");

            migrationBuilder.DropIndex(
                name: "ix_highlights_user_id_site_id_edition_id",
                table: "highlights");

            migrationBuilder.DropIndex(
                name: "ix_highlights_user_id_site_id_user_book_id",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "user_book_id",
                table: "user_ratings");

            migrationBuilder.DropColumn(
                name: "user_book_id",
                table: "user_mood_tags");

            migrationBuilder.DropColumn(
                name: "last_reviewed_at",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "user_book_id",
                table: "highlights");

            migrationBuilder.DropColumn(
                name: "user_chapter_id",
                table: "highlights");

            migrationBuilder.AlterColumn<Guid>(
                name: "edition_id",
                table: "user_ratings",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "edition_id",
                table: "user_mood_tags",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "edition_id",
                table: "highlights",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "chapter_id",
                table: "highlights",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_ratings_user_id_site_id_edition_id",
                table: "user_ratings",
                columns: new[] { "user_id", "site_id", "edition_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_edition_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "edition_id" });

            migrationBuilder.CreateIndex(
                name: "ix_user_mood_tags_user_id_edition_id_mood_id",
                table: "user_mood_tags",
                columns: new[] { "user_id", "edition_id", "mood_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_highlights_user_id_site_id_edition_id",
                table: "highlights",
                columns: new[] { "user_id", "site_id", "edition_id" });

            migrationBuilder.AddForeignKey(
                name: "fk_highlights_chapters_chapter_id",
                table: "highlights",
                column: "chapter_id",
                principalTable: "chapters",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_highlights_editions_edition_id",
                table: "highlights",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_user_mood_tags_editions_edition_id",
                table: "user_mood_tags",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_user_ratings_editions_edition_id",
                table: "user_ratings",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
