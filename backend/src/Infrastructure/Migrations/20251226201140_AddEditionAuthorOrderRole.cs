using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEditionAuthorOrderRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_edition_authors_authors_authors_id",
                table: "edition_authors");

            migrationBuilder.DropForeignKey(
                name: "fk_edition_authors_editions_editions_id",
                table: "edition_authors");

            migrationBuilder.RenameColumn(
                name: "editions_id",
                table: "edition_authors",
                newName: "author_id");

            migrationBuilder.RenameColumn(
                name: "authors_id",
                table: "edition_authors",
                newName: "edition_id");

            migrationBuilder.RenameIndex(
                name: "ix_edition_authors_editions_id",
                table: "edition_authors",
                newName: "ix_edition_authors_author_id");

            migrationBuilder.AddColumn<int>(
                name: "order",
                table: "edition_authors",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Backfill order values for existing rows
            migrationBuilder.Sql(@"
                WITH ordered AS (
                    SELECT edition_id, author_id,
                           ROW_NUMBER() OVER (PARTITION BY edition_id ORDER BY author_id) - 1 AS rn
                    FROM edition_authors
                )
                UPDATE edition_authors ea
                SET ""order"" = o.rn
                FROM ordered o
                WHERE ea.edition_id = o.edition_id AND ea.author_id = o.author_id;
            ");

            migrationBuilder.AddColumn<string>(
                name: "role",
                table: "edition_authors",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Author");

            // Delete orphaned records before adding FK constraints
            migrationBuilder.Sql(@"
                DELETE FROM edition_authors
                WHERE author_id NOT IN (SELECT id FROM authors);
            ");
            migrationBuilder.Sql(@"
                DELETE FROM edition_authors
                WHERE edition_id NOT IN (SELECT id FROM editions);
            ");

            migrationBuilder.AddForeignKey(
                name: "fk_edition_authors_authors_author_id",
                table: "edition_authors",
                column: "author_id",
                principalTable: "authors",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_edition_authors_editions_edition_id",
                table: "edition_authors",
                column: "edition_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_edition_authors_authors_author_id",
                table: "edition_authors");

            migrationBuilder.DropForeignKey(
                name: "fk_edition_authors_editions_edition_id",
                table: "edition_authors");

            migrationBuilder.DropColumn(
                name: "order",
                table: "edition_authors");

            migrationBuilder.DropColumn(
                name: "role",
                table: "edition_authors");

            migrationBuilder.RenameColumn(
                name: "author_id",
                table: "edition_authors",
                newName: "editions_id");

            migrationBuilder.RenameColumn(
                name: "edition_id",
                table: "edition_authors",
                newName: "authors_id");

            migrationBuilder.RenameIndex(
                name: "ix_edition_authors_author_id",
                table: "edition_authors",
                newName: "ix_edition_authors_editions_id");

            migrationBuilder.AddForeignKey(
                name: "fk_edition_authors_authors_authors_id",
                table: "edition_authors",
                column: "authors_id",
                principalTable: "authors",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_edition_authors_editions_editions_id",
                table: "edition_authors",
                column: "editions_id",
                principalTable: "editions",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
