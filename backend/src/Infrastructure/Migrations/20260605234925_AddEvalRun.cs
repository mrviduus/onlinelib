using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEvalRun : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "eval_runs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    feature = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    judge_model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    score = table.Column<decimal>(type: "numeric(6,3)", nullable: false),
                    n = table.Column<int>(type: "integer", nullable: false),
                    breakdown_json = table.Column<string>(type: "jsonb", nullable: true),
                    git_sha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_eval_runs", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_eval_runs_feature_created_at",
                table: "eval_runs",
                columns: new[] { "feature", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "eval_runs");
        }
    }
}
