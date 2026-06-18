using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddConceptClustering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "kind",
                table: "word_clusters",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "book");

            migrationBuilder.AddColumn<Guid>(
                name: "concept_cluster_id",
                table: "vocabulary_words",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Vector>(
                name: "embedding",
                table: "vocabulary_words",
                type: "vector(1536)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_concept_cluster_id",
                table: "vocabulary_words",
                column: "concept_cluster_id");

            migrationBuilder.AddForeignKey(
                name: "fk_vocabulary_words_word_clusters_concept_cluster_id",
                table: "vocabulary_words",
                column: "concept_cluster_id",
                principalTable: "word_clusters",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_vocabulary_words_word_clusters_concept_cluster_id",
                table: "vocabulary_words");

            migrationBuilder.DropIndex(
                name: "ix_vocabulary_words_concept_cluster_id",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "kind",
                table: "word_clusters");

            migrationBuilder.DropColumn(
                name: "concept_cluster_id",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "embedding",
                table: "vocabulary_words");
        }
    }
}
