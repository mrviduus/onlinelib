using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReadingRooms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reading_rooms",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    target_id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_activity_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reading_rooms", x => x.id);
                    table.ForeignKey(
                        name: "fk_reading_rooms_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_reading_rooms_users_owner_user_id",
                        column: x => x.owner_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "reading_room_invites",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    room_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    max_uses = table.Column<int>(type: "integer", nullable: true),
                    uses_count = table.Column<int>(type: "integer", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reading_room_invites", x => x.id);
                    table.ForeignKey(
                        name: "fk_reading_room_invites_reading_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "reading_rooms",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_reading_room_invites_users_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "reading_room_members",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    room_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    color = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    show_progress = table.Column<bool>(type: "boolean", nullable: false),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    left_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    current_chapter_id = table.Column<Guid>(type: "uuid", nullable: true),
                    current_percent = table.Column<double>(type: "double precision", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reading_room_members", x => x.id);
                    table.ForeignKey(
                        name: "fk_reading_room_members_chapters_current_chapter_id",
                        column: x => x.current_chapter_id,
                        principalTable: "chapters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_reading_room_members_reading_rooms_room_id",
                        column: x => x.room_id,
                        principalTable: "reading_rooms",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_reading_room_members_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_invites_created_by_user_id",
                table: "reading_room_invites",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_invites_room_id",
                table: "reading_room_invites",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_invites_token_hash",
                table: "reading_room_invites",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_members_current_chapter_id",
                table: "reading_room_members",
                column: "current_chapter_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_members_room_id",
                table: "reading_room_members",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_members_room_id_user_id",
                table: "reading_room_members",
                columns: new[] { "room_id", "user_id" },
                unique: true,
                filter: "left_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_reading_room_members_user_id",
                table: "reading_room_members",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_rooms_last_activity_at",
                table: "reading_rooms",
                column: "last_activity_at");

            migrationBuilder.CreateIndex(
                name: "ix_reading_rooms_owner_user_id",
                table: "reading_rooms",
                column: "owner_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_rooms_site_id",
                table: "reading_rooms",
                column: "site_id");

            migrationBuilder.CreateIndex(
                name: "ix_reading_rooms_target_type_target_id",
                table: "reading_rooms",
                columns: new[] { "target_type", "target_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reading_room_invites");

            migrationBuilder.DropTable(
                name: "reading_room_members");

            migrationBuilder.DropTable(
                name: "reading_rooms");
        }
    }
}
