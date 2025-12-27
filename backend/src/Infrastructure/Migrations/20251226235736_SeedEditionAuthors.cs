using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedEditionAuthors : Migration
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

            // ========== AUTHORS (General Site) ==========
            // Use ON CONFLICT on unique constraint (site_id, slug)

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, bio, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'taras-shevchenko-uk', 'Тарас Шевченко', 'Український поет, художник та мислитель.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, bio, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'taras-shevchenko', 'Taras Shevchenko', 'Ukrainian poet, artist and thinker.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, bio, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'lesya-ukrainka-uk', 'Леся Українка', 'Українська письменниця, поетеса та перекладачка.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, bio, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'lesya-ukrainka', 'Lesya Ukrainka', 'Ukrainian writer, poet and translator.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== AUTHORS (Programming Site) ==========

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, bio, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'robert-martin', 'Robert C. Martin', 'Software engineer known as Uncle Bob.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, bio, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'robert-martin-uk', 'Роберт Мартін', 'Інженер-програміст, відомий як Дядько Боб.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'erich-gamma', 'Erich Gamma', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'richard-helm', 'Richard Helm', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'ralph-johnson', 'Ralph Johnson', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'john-vlissides', 'John Vlissides', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'erich-gamma-uk', 'Еріх Гамма', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'richard-helm-uk', 'Річард Хелм', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'ralph-johnson-uk', 'Ральф Джонсон', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO authors (id, site_id, slug, name, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'john-vlissides-uk', 'Джон Вліссідес', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== EDITION-AUTHOR LINKS ==========
            // Use subquery to get author_id by slug (handles existing or newly created)

            // Kobzar UK -> Shevchenko UK (fallback to existing slug pattern)
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition1UkId}', id, 0, 'author'
                FROM authors WHERE site_id = '{generalSiteId}' AND (slug = 'taras-shevchenko-uk' OR slug = 'тарас-шевченко') LIMIT 1
                ON CONFLICT DO NOTHING");

            // Kobzar EN -> Shevchenko EN
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition1EnId}', id, 0, 'author'
                FROM authors WHERE site_id = '{generalSiteId}' AND slug = 'taras-shevchenko' LIMIT 1
                ON CONFLICT DO NOTHING");

            // Forest Song UK -> Ukrainka UK
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition2UkId}', id, 0, 'author'
                FROM authors WHERE site_id = '{generalSiteId}' AND (slug = 'lesya-ukrainka-uk' OR slug LIKE 'леся-%') LIMIT 1
                ON CONFLICT DO NOTHING");

            // Forest Song EN -> Ukrainka EN
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition2EnId}', id, 0, 'author'
                FROM authors WHERE site_id = '{generalSiteId}' AND slug = 'lesya-ukrainka' LIMIT 1
                ON CONFLICT DO NOTHING");

            // Clean Code UK -> Martin UK
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition3UkId}', id, 0, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'robert-martin-uk' OR name = 'Роберт Мартін') LIMIT 1
                ON CONFLICT DO NOTHING");

            // Clean Code EN -> Martin EN
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition3EnId}', id, 0, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'robert-martin' OR name = 'Robert C. Martin') LIMIT 1
                ON CONFLICT DO NOTHING");

            // Design Patterns UK -> GoF UK
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4UkId}', id, 0, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'erich-gamma-uk' OR name = 'Еріх Гамма') LIMIT 1
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4UkId}', id, 1, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'richard-helm-uk' OR name = 'Річард Хелм') LIMIT 1
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4UkId}', id, 2, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'ralph-johnson-uk' OR name = 'Ральф Джонсон') LIMIT 1
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4UkId}', id, 3, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'john-vlissides-uk' OR name = 'Джон Вліссідес') LIMIT 1
                ON CONFLICT DO NOTHING");

            // Design Patterns EN -> GoF EN
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4EnId}', id, 0, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'erich-gamma' OR name = 'Erich Gamma') LIMIT 1
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4EnId}', id, 1, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'richard-helm' OR name = 'Richard Helm') LIMIT 1
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4EnId}', id, 2, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'ralph-johnson' OR name = 'Ralph Johnson') LIMIT 1
                ON CONFLICT DO NOTHING");
            migrationBuilder.Sql($@"
                INSERT INTO edition_authors (edition_id, author_id, ""order"", role)
                SELECT '{edition4EnId}', id, 3, 'author'
                FROM authors WHERE site_id = '{programmingSiteId}' AND (slug = 'john-vlissides' OR name = 'John Vlissides') LIMIT 1
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

            // Delete edition_authors links for seeded editions
            migrationBuilder.Sql($@"
                DELETE FROM edition_authors
                WHERE edition_id IN ('{edition1UkId}', '{edition1EnId}', '{edition2UkId}', '{edition2EnId}',
                                     '{edition3UkId}', '{edition3EnId}', '{edition4UkId}', '{edition4EnId}')");

            // Note: Don't delete authors in Down as they may have been created manually or used elsewhere
        }
    }
}
