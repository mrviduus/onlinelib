using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelRegistryAndShadowRun : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "models",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    feature_tag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_models", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "shadow_runs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    feature_tag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    primary_model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    shadow_model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    primary_response = table.Column<string>(type: "text", nullable: true),
                    shadow_response = table.Column<string>(type: "text", nullable: true),
                    primary_latency_ms = table.Column<int>(type: "integer", nullable: false),
                    shadow_latency_ms = table.Column<int>(type: "integer", nullable: false),
                    primary_cost_usd = table.Column<decimal>(type: "numeric(10,6)", nullable: false),
                    shadow_cost_usd = table.Column<decimal>(type: "numeric(10,6)", nullable: false),
                    primary_tokens_in = table.Column<int>(type: "integer", nullable: false),
                    primary_tokens_out = table.Column<int>(type: "integer", nullable: false),
                    shadow_tokens_in = table.Column<int>(type: "integer", nullable: false),
                    shadow_tokens_out = table.Column<int>(type: "integer", nullable: false),
                    primary_trace_id = table.Column<Guid>(type: "uuid", nullable: true),
                    shadow_trace_id = table.Column<Guid>(type: "uuid", nullable: true),
                    prompt_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_shadow_runs", x => x.id);
                    table.ForeignKey(
                        name: "fk_shadow_runs_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_models_feature_tag_provider_key_model_id",
                table: "models",
                columns: new[] { "feature_tag", "provider_key", "model_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_models_feature_tag_status",
                table: "models",
                columns: new[] { "feature_tag", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_shadow_runs_feature_tag_created_at",
                table: "shadow_runs",
                columns: new[] { "feature_tag", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_shadow_runs_user_id",
                table: "shadow_runs",
                column: "user_id",
                filter: "user_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "models");

            migrationBuilder.DropTable(
                name: "shadow_runs");
        }
    }
}
