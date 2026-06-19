using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEditionRagIndexState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "rag_chunk_count",
                table: "editions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "rag_embedded_count",
                table: "editions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "rag_error",
                table: "editions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "rag_indexed_at",
                table: "editions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rag_status",
                table: "editions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Backfill from chunks that already exist (AI-019 ingestion chunker ran before this
            // feature). Without this, editions that are already chunked/embedded default to
            // NotIndexed/0 — and the on-demand trigger would re-chunk them into DUPLICATE rows and
            // re-embed every chunk (wasted OpenAI $), and never flip Ready. Set counts from the
            // chunk table and status: Ready when every chunk is embedded, else Indexing (the
            // embedding worker drains the remainder). Editions with no chunks stay NotIndexed/0.
            migrationBuilder.Sql("""
                UPDATE editions e
                SET rag_chunk_count = c.total,
                    rag_embedded_count = c.embedded,
                    rag_status = CASE WHEN c.embedded = c.total THEN 2 ELSE 1 END,
                    rag_indexed_at = CASE WHEN c.embedded = c.total THEN now() ELSE NULL END
                FROM (
                    SELECT edition_id,
                           count(*) AS total,
                           count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
                    FROM chapter_chunk
                    GROUP BY edition_id
                ) c
                WHERE e.id = c.edition_id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "rag_chunk_count",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "rag_embedded_count",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "rag_error",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "rag_indexed_at",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "rag_status",
                table: "editions");
        }
    }
}
