using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRagIndexingStaleSweepIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_user_books_rag_indexing_started_at",
                table: "user_books",
                column: "rag_indexing_started_at",
                filter: "rag_status = 1");

            migrationBuilder.CreateIndex(
                name: "ix_editions_rag_indexing_started_at",
                table: "editions",
                column: "rag_indexing_started_at",
                filter: "rag_status = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_user_books_rag_indexing_started_at",
                table: "user_books");

            migrationBuilder.DropIndex(
                name: "ix_editions_rag_indexing_started_at",
                table: "editions");
        }
    }
}
