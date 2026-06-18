using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelPromotionAndPrimaryUniqueIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "model_promotions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    feature_tag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    from_model_registration_id = table.Column<Guid>(type: "uuid", nullable: true),
                    to_model_registration_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_provider_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    from_model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    to_provider_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    to_model_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    action = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    admin_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_model_promotions", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_models_feature_tag",
                table: "models",
                column: "feature_tag",
                unique: true,
                filter: "status = 'Primary'");

            migrationBuilder.CreateIndex(
                name: "ix_model_promotions_feature_tag_created_at",
                table: "model_promotions",
                columns: new[] { "feature_tag", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "model_promotions");

            migrationBuilder.DropIndex(
                name: "ix_models_feature_tag",
                table: "models");
        }
    }
}
