using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedMoreGenres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var generalSiteId = "11111111-1111-1111-1111-111111111111";
            var programmingSiteId = "22222222-2222-2222-2222-222222222222";
            var now = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.ffffff+00");

            // ========== GENERAL SITE - Fiction Genres ==========

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'fiction', 'Fiction', 'Imaginative and narrative prose works.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'science-fiction', 'Science Fiction', 'Speculative fiction exploring futuristic concepts and technology.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'fantasy', 'Fantasy', 'Fiction featuring magical and supernatural elements.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'mystery', 'Mystery', 'Stories centered around solving crimes or puzzles.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'thriller', 'Thriller', 'Suspenseful stories with tension and excitement.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'romance', 'Romance', 'Stories focused on romantic relationships.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'horror', 'Horror', 'Fiction designed to frighten and create suspense.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'adventure', 'Adventure', 'Exciting stories with journeys and explorations.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'historical-fiction', 'Historical Fiction', 'Fiction set in a specific historical period.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'detective', 'Detective', 'Crime fiction featuring investigation and detection.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== GENERAL SITE - Non-Fiction Genres ==========

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'non-fiction', 'Non-Fiction', 'Factual prose works based on real events.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'biography', 'Biography', 'Accounts of people''s lives written by others.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'autobiography', 'Autobiography', 'Self-written accounts of one''s own life.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'history', 'History', 'Non-fiction about past events and civilizations.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'science', 'Science', 'Books about scientific discoveries and concepts.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'philosophy', 'Philosophy', 'Exploration of fundamental questions about existence.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'psychology', 'Psychology', 'Study of mind, behavior and mental processes.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'self-help', 'Self-Help', 'Books for personal improvement and development.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'business', 'Business', 'Books about commerce, entrepreneurship and management.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'economics', 'Economics', 'Study of production, distribution and consumption.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== GENERAL SITE - Special Categories ==========

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'children', 'Children''s Books', 'Books written for young readers.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'young-adult', 'Young Adult', 'Books for teenage readers.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'comics', 'Comics & Graphic Novels', 'Visual storytelling in comic format.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'essays', 'Essays', 'Short literary compositions on various subjects.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'travel', 'Travel', 'Books about journeys and destinations.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'art', 'Art & Photography', 'Books about visual arts and photography.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'cooking', 'Cooking & Food', 'Cookbooks and culinary literature.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'religion', 'Religion & Spirituality', 'Books about faith and spiritual practices.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'humor', 'Humor', 'Comedy and humorous writing.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{generalSiteId}', 'short-stories', 'Short Stories', 'Collections of brief fictional narratives.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            // ========== PROGRAMMING SITE - Additional Genres ==========

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'web-development', 'Web Development', 'Frontend, backend and full-stack web technologies.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'mobile-development', 'Mobile Development', 'iOS, Android and cross-platform app development.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'databases', 'Databases', 'SQL, NoSQL and database design.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'devops', 'DevOps', 'CI/CD, infrastructure and deployment.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'machine-learning', 'Machine Learning & AI', 'Artificial intelligence and ML algorithms.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'algorithms', 'Algorithms & Data Structures', 'Fundamental CS algorithms and data structures.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'computer-science', 'Computer Science', 'Theoretical foundations of computing.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'security', 'Security', 'Cybersecurity and secure coding practices.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'networking', 'Networking', 'Computer networks and protocols.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'testing', 'Testing & QA', 'Software testing and quality assurance.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");

            migrationBuilder.Sql($@"
                INSERT INTO genres (id, site_id, slug, name, description, indexable, created_at, updated_at)
                VALUES (gen_random_uuid(), '{programmingSiteId}', 'architecture', 'Software Architecture', 'System design and architectural patterns.', true, '{now}', '{now}')
                ON CONFLICT (site_id, slug) DO NOTHING");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Note: Don't delete genres in Down as they may be used by editions
        }
    }
}
