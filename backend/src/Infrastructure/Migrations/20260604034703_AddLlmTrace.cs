using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLlmTrace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "llm_traces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    feature_tag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    prompt_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    system_prompt = table.Column<string>(type: "text", nullable: true),
                    messages_json = table.Column<string>(type: "jsonb", nullable: false),
                    response_text = table.Column<string>(type: "text", nullable: true),
                    tool_calls_json = table.Column<string>(type: "jsonb", nullable: true),
                    tokens_in = table.Column<int>(type: "integer", nullable: false),
                    tokens_out = table.Column<int>(type: "integer", nullable: false),
                    cost_usd = table.Column<decimal>(type: "numeric(10,6)", nullable: false),
                    latency_ms = table.Column<int>(type: "integer", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    trace_parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_llm_traces", x => x.id);
                    table.ForeignKey(
                        name: "fk_llm_traces_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_llm_traces_feature_tag_created_at",
                table: "llm_traces",
                columns: new[] { "feature_tag", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_llm_traces_user_id",
                table: "llm_traces",
                column: "user_id",
                filter: "user_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "llm_traces");
        }
    }
}
