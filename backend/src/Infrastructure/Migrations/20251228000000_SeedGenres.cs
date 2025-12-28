using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedGenres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Site IDs
            var generalSiteId = "11111111-1111-1111-1111-111111111111";
            var programmingSiteId = "22222222-2222-2222-2222-222222222222";

            // Edition IDs (from SeedExampleBooks)
            var edition1UkId = "bbbbbbbb-0001-0001-0001-000000000001"; // Kobzar UK
            var edition1EnId = "bbbbbbbb-0001-0001-0001-000000000002"; // Kobzar EN
            var edition2UkId = "bbbbbbbb-0002-0002-0002-000000000001"; // Forest Song UK
            var edition2EnId = "bbbbbbbb-0002-0002-0002-000000000002"; // Forest Song EN
            var edition3UkId = "bbbbbbbb-0003-0003-0003-000000000001"; // Clean Code UK
            var edition3EnId = "bbbbbbbb-0003-0003-0003-000000000002"; // Clean Code EN
            var edition4UkId = "bbbbbbbb-0004-0004-0004-000000000001"; // Design Patterns UK
            var edition4EnId = "bbbbbbbb-0004-0004-0004-000000000002"; // Design Patterns EN

            var now = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.ffffff+00");

            // ========== GENRES (General Site) ==========

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'poetry', 'Poetry', 'Poetic works and verse collections.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'drama', 'Drama', 'Theatrical plays and dramatic works.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'classic-literature', 'Classic Literature', 'Timeless literary masterpieces.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'ukrainian-literature', 'Ukrainian Literature', 'Works by Ukrainian authors.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== GENRES (Programming Site) ==========

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'software-development', 'Software Development', 'General software engineering and development practices.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'design-patterns', 'Design Patterns', 'Software design patterns and architectural solutions.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'clean-code', 'Clean Code', 'Code quality, readability and maintainability.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'object-oriented-programming', 'Object-Oriented Programming', 'OOP concepts and best practices.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== EDITION-GENRE LINKS ==========

            // Kobzar UK -> Poetry, Classic Literature, Ukrainian Literature
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition1UkId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'poetry'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition1UkId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'classic-literature'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition1UkId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'ukrainian-literature'
                ON CONFLICT DO NOTHING");

            // Kobzar EN -> Poetry, Classic Literature, Ukrainian Literature
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition1EnId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'poetry'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition1EnId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'classic-literature'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition1EnId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'ukrainian-literature'
                ON CONFLICT DO NOTHING");

            // Forest Song UK -> Drama, Classic Literature, Ukrainian Literature
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition2UkId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'drama'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition2UkId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'classic-literature'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition2UkId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'ukrainian-literature'
                ON CONFLICT DO NOTHING");

            // Forest Song EN -> Drama, Classic Literature, Ukrainian Literature
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition2EnId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'drama'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition2EnId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'classic-literature'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition2EnId}', id FROM genres WHERE site_id = '{generalSiteId}' AND slug = 'ukrainian-literature'
                ON CONFLICT DO NOTHING");

            // Clean Code UK -> Software Development, Clean Code
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition3UkId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'software-development'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition3UkId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'clean-code'
                ON CONFLICT DO NOTHING");

            // Clean Code EN -> Software Development, Clean Code
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition3EnId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'software-development'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition3EnId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'clean-code'
                ON CONFLICT DO NOTHING");

            // Design Patterns UK -> Software Development, Design Patterns, OOP
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition4UkId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'software-development'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition4UkId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'design-patterns'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition4UkId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'object-oriented-programming'
                ON CONFLICT DO NOTHING");

            // Design Patterns EN -> Software Development, Design Patterns, OOP
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition4EnId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'software-development'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition4EnId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'design-patterns'
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_genres (editions_id, genres_id)
                SELECT '{edition4EnId}', id FROM genres WHERE site_id = '{programmingSiteId}' AND slug = 'object-oriented-programming'
                ON CONFLICT DO NOTHING");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Edition IDs
            var edition1UkId = "bbbbbbbb-0001-0001-0001-000000000001";
            var edition1EnId = "bbbbbbbb-0001-0001-0001-000000000002";
            var edition2UkId = "bbbbbbbb-0002-0002-0002-000000000001";
            var edition2EnId = "bbbbbbbb-0002-0002-0002-000000000002";
            var edition3UkId = "bbbbbbbb-0003-0003-0003-000000000001";
            var edition3EnId = "bbbbbbbb-0003-0003-0003-000000000002";
            var edition4UkId = "bbbbbbbb-0004-0004-0004-000000000001";
            var edition4EnId = "bbbbbbbb-0004-0004-0004-000000000002";

            // Delete edition_genres links for seeded editions
            migrationBuilder.Sql($@"
                DELETE FROM edition_genres
                WHERE editions_id IN ('{edition1UkId}', '{edition1EnId}', '{edition2UkId}', '{edition2EnId}',
                                     '{edition3UkId}', '{edition3EnId}', '{edition4UkId}', '{edition4EnId}')");

            // Note: Don't delete genres in Down as they may have been created manually or used elsewhere
        }
    }
}
