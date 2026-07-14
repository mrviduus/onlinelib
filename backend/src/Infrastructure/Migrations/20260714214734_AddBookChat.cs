using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBookChat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "book_conversation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    edition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_book_id = table.Column<Guid>(type: "uuid", nullable: true),
                    spoiler_gate_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    summary = table.Column<string>(type: "text", nullable: true),
                    summarized_through_ord = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_book_conversation", x => x.id);
                    table.CheckConstraint("ck_book_conversation_target", "(edition_id IS NOT NULL AND user_book_id IS NULL) OR (edition_id IS NULL AND user_book_id IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_book_conversation_editions_edition_id",
                        column: x => x.edition_id,
                        principalTable: "editions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_book_conversation_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_book_conversation_user_books_user_book_id",
                        column: x => x.user_book_id,
                        principalTable: "user_books",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_book_conversation_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "conversation_message",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    conversation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ord = table.Column<int>(type: "integer", nullable: false),
                    role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    citations_json = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversation_message", x => x.id);
                    table.ForeignKey(
                        name: "fk_conversation_message_book_conversation_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "book_conversation",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_book_conversation_edition_id",
                table: "book_conversation",
                column: "edition_id");

            migrationBuilder.CreateIndex(
                name: "ix_book_conversation_site_id",
                table: "book_conversation",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_book_conversation_user_book_id",
                table: "book_conversation",
                column: "user_book_id");

            migrationBuilder.CreateIndex(
                name: "ix_book_conversation_user_id_edition_id",
                table: "book_conversation",
                columns: new[] { "user_id", "edition_id" },
                unique: true,
                filter: "edition_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_book_conversation_user_id_user_book_id",
                table: "book_conversation",
                columns: new[] { "user_id", "user_book_id" },
                unique: true,
                filter: "user_book_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_conversation_message_conversation_id_ord",
                table: "conversation_message",
                columns: new[] { "conversation_id", "ord" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "conversation_message");

            migrationBuilder.DropTable(
                name: "book_conversation");
        }
    }
}
