using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UserVocabularySettingsAutoSpeakCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "auto_speak_cards",
                table: "user_vocabulary_settings",
                type: "boolean",
                nullable: false,
                // true, not the CLR default: the entity default is ON, and leaving existing rows
                // at false would give everyone who already has a settings row the opposite of
                // what a new account gets.
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "auto_speak_cards",
                table: "user_vocabulary_settings");
        }
    }
}
