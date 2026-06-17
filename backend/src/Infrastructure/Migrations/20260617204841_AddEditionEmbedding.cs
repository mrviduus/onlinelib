using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEditionEmbedding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Vector>(
                name: "embedding",
                table: "editions",
                type: "vector(1536)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_editions_embedding",
                table: "editions",
                column: "embedding")
                .Annotation("Npgsql:IndexMethod", "hnsw")
                .Annotation("Npgsql:IndexOperators", new[] { "vector_cosine_ops" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_editions_embedding",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "embedding",
                table: "editions");
        }
    }
}
