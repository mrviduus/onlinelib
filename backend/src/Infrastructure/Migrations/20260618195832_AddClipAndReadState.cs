using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClipAndReadState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_clip",
                table: "user_books",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_read",
                table: "user_books",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "read_at",
                table: "user_books",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "source_url",
                table: "user_books",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_books_user_id_is_clip",
                table: "user_books",
                columns: new[] { "user_id", "is_clip" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_user_books_user_id_is_clip",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "is_clip",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "is_read",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "read_at",
                table: "user_books");

            migrationBuilder.DropColumn(
                name: "source_url",
                table: "user_books");
        }
    }
}
