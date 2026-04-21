using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVocabularyAntiSpiralColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_vocabulary_words_user_id_site_id_next_review_at",
                table: "vocabulary_words");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "activated_at",
                table: "vocabulary_words",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "cluster_id",
                table: "vocabulary_words",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_retired",
                table: "vocabulary_words",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "priority",
                table: "vocabulary_words",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "retired_at",
                table: "vocabulary_words",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "retired_reason",
                table: "vocabulary_words",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "source",
                table: "vocabulary_words",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "tap");

            migrationBuilder.AddColumn<int>(
                name: "zipf_rank",
                table: "vocabulary_words",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "zipf_score",
                table: "vocabulary_words",
                type: "double precision",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "user_vocabulary_settings",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    daily_new_cap = table.Column<int>(type: "integer", nullable: false),
                    weekly_review_budget = table.Column<int>(type: "integer", nullable: false),
                    frequency_filter_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    clustering_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    auto_retire_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_vocabulary_settings", x => new { x.user_id, x.site_id });
                    table.ForeignKey(
                        name: "fk_user_vocabulary_settings_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_vocabulary_settings_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_user_id_site_id_is_retired_next_review_at",
                table: "vocabulary_words",
                columns: new[] { "user_id", "site_id", "is_retired", "next_review_at" });

            migrationBuilder.CreateIndex(
                name: "ix_user_vocabulary_settings_site_id",
                table: "user_vocabulary_settings",
                column: "site_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_vocabulary_settings");

            migrationBuilder.DropIndex(
                name: "ix_vocabulary_words_user_id_site_id_is_retired_next_review_at",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "activated_at",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "cluster_id",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "is_retired",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "priority",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "retired_at",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "retired_reason",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "source",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "zipf_rank",
                table: "vocabulary_words");

            migrationBuilder.DropColumn(
                name: "zipf_score",
                table: "vocabulary_words");

            migrationBuilder.CreateIndex(
                name: "ix_vocabulary_words_user_id_site_id_next_review_at",
                table: "vocabulary_words",
                columns: new[] { "user_id", "site_id", "next_review_at" });
        }
    }
}
