using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedExampleBooks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Site IDs (from AddSites migration)
            var generalSiteId = "11111111-1111-1111-1111-111111111111";
            var programmingSiteId = "22222222-2222-2222-2222-222222222222";

            // Work IDs
            var work1Id = "aaaaaaaa-0001-0001-0001-000000000001"; // Kobzar
            var work2Id = "aaaaaaaa-0002-0002-0002-000000000002"; // Forest Song
            var work3Id = "aaaaaaaa-0003-0003-0003-000000000003"; // Clean Code
            var work4Id = "aaaaaaaa-0004-0004-0004-000000000004"; // Design Patterns

            // Edition IDs
            var edition1UkId = "bbbbbbbb-0001-0001-0001-000000000001"; // Kobzar UK
            var edition1EnId = "bbbbbbbb-0001-0001-0001-000000000002"; // Kobzar EN
            var edition2UkId = "bbbbbbbb-0002-0002-0002-000000000001"; // Forest Song UK
            var edition2EnId = "bbbbbbbb-0002-0002-0002-000000000002"; // Forest Song EN
            var edition3UkId = "bbbbbbbb-0003-0003-0003-000000000001"; // Clean Code UK
            var edition3EnId = "bbbbbbbb-0003-0003-0003-000000000002"; // Clean Code EN
            var edition4UkId = "bbbbbbbb-0004-0004-0004-000000000001"; // Design Patterns UK
            var edition4EnId = "bbbbbbbb-0004-0004-0004-000000000002"; // Design Patterns EN

            var now = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.ffffff+00");

            // ========== GENERAL SITE BOOKS ==========

            // Work 1: Kobzar
            migrationBuilder.Sql($@"
                INSERT INTO works (id, site_id, slug, created_at)
                VALUES ('{work1Id}', '{generalSiteId}', 'kobzar', '{now}')");

            // Kobzar - Ukrainian edition
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition1UkId}', '{work1Id}', '{generalSiteId}', 'uk', 'kobzar', 'Кобзар', 'Збірка поезій Тараса Шевченка, що стала символом української літератури.', '[""Тарас Шевченко""]', 1, '1840-01-01 00:00:00+00', NULL, NULL, true, '{now}', '{now}')");

            // Kobzar - English edition
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition1EnId}', '{work1Id}', '{generalSiteId}', 'en', 'kobzar', 'The Kobzar', 'A collection of poems by Taras Shevchenko, a symbol of Ukrainian literature.', '[""Taras Shevchenko""]', 1, '1840-01-01 00:00:00+00', '{edition1UkId}', NULL, true, '{now}', '{now}')");

            // Work 2: Forest Song
            migrationBuilder.Sql($@"
                INSERT INTO works (id, site_id, slug, created_at)
                VALUES ('{work2Id}', '{generalSiteId}', 'forest-song', '{now}')");

            // Forest Song - Ukrainian edition
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition2UkId}', '{work2Id}', '{generalSiteId}', 'uk', 'lisova-pisnya', 'Лісова пісня', 'Драма-феєрія Лесі Українки про кохання лісової мавки та простого селянина.', '[""Леся Українка""]', 1, '1911-01-01 00:00:00+00', NULL, NULL, true, '{now}', '{now}')");

            // Forest Song - English edition
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition2EnId}', '{work2Id}', '{generalSiteId}', 'en', 'forest-song', 'Forest Song', 'A drama-fairy tale by Lesya Ukrainka about the love between a forest nymph and a peasant.', '[""Lesya Ukrainka""]', 1, '1911-01-01 00:00:00+00', '{edition2UkId}', NULL, true, '{now}', '{now}')");

            // ========== PROGRAMMING SITE BOOKS ==========

            // Work 3: Clean Code
            migrationBuilder.Sql($@"
                INSERT INTO works (id, site_id, slug, created_at)
                VALUES ('{work3Id}', '{programmingSiteId}', 'clean-code', '{now}')");

            // Clean Code - English edition (original)
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition3EnId}', '{work3Id}', '{programmingSiteId}', 'en', 'clean-code', 'Clean Code', 'A Handbook of Agile Software Craftsmanship. Learn to write code that is easy to read, understand, and maintain.', '[""Robert C. Martin""]', 1, '2008-08-01 00:00:00+00', NULL, NULL, false, '{now}', '{now}')");

            // Clean Code - Ukrainian edition
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition3UkId}', '{work3Id}', '{programmingSiteId}', 'uk', 'clean-code', 'Чистий код', 'Посібник з гнучкої розробки програмного забезпечення. Навчіться писати код, який легко читати та підтримувати.', '[""Роберт Мартін""]', 1, '2008-08-01 00:00:00+00', '{edition3EnId}', NULL, false, '{now}', '{now}')");

            // Work 4: Design Patterns
            migrationBuilder.Sql($@"
                INSERT INTO works (id, site_id, slug, created_at)
                VALUES ('{work4Id}', '{programmingSiteId}', 'design-patterns', '{now}')");

            // Design Patterns - English edition (original)
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition4EnId}', '{work4Id}', '{programmingSiteId}', 'en', 'design-patterns', 'Design Patterns', 'Elements of Reusable Object-Oriented Software. The classic Gang of Four book on software design patterns.', '[""Erich Gamma"",""Richard Helm"",""Ralph Johnson"",""John Vlissides""]', 1, '1994-10-01 00:00:00+00', NULL, NULL, false, '{now}', '{now}')");

            // Design Patterns - Ukrainian edition
            migrationBuilder.Sql($@"
                INSERT INTO editions (id, work_id, site_id, language, slug, title, description, authors_json, status, published_at, source_edition_id, cover_path, is_public_domain, created_at, updated_at)
                VALUES ('{edition4UkId}', '{work4Id}', '{programmingSiteId}', 'uk', 'design-patterns', 'Патерни проектування', 'Елементи повторного використання об''єктно-орієнтованого програмного забезпечення. Класична книга Банди чотирьох.', '[""Еріх Гамма"",""Річард Хелм"",""Ральф Джонсон"",""Джон Вліссідес""]', 1, '1994-10-01 00:00:00+00', '{edition4EnId}', NULL, false, '{now}', '{now}')");

            // ========== CHAPTERS ==========
            // Note: search_vector is populated by trigger, not inserted directly

            // Kobzar UK - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition1UkId}', 1, 'dumy-moyi', 'Думи мої, думи мої', '<h1>Думи мої, думи мої</h1><p>Думи мої, думи мої,<br/>Лихо мені з вами!<br/>Нащо стали на папері<br/>Сумними рядами?</p>', 'Думи мої, думи мої, Лихо мені з вами! Нащо стали на папері Сумними рядами?', 15, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition1UkId}', 2, 'kateryna', 'Катерина', '<h1>Катерина</h1><p>Кохайтеся, чорнобриві,<br/>Та не з москалями,<br/>Бо москалі — чужі люде,<br/>Роблять лихо з вами.</p>', 'Кохайтеся, чорнобриві, Та не з москалями, Бо москалі — чужі люде, Роблять лихо з вами.', 14, '{now}', '{now}')");

            // Kobzar EN - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition1EnId}', 1, 'my-thoughts', 'My Thoughts', '<h1>My Thoughts</h1><p>My thoughts, my thoughts,<br/>My woe is with you!<br/>Why have you settled on paper<br/>In mournful rows?</p>', 'My thoughts, my thoughts, My woe is with you! Why have you settled on paper In mournful rows?', 18, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition1EnId}', 2, 'kateryna', 'Kateryna', '<h1>Kateryna</h1><p>Fall in love, dark-browed maidens,<br/>But not with Muscovites,<br/>For Muscovites are foreign folk,<br/>They will bring you only strife.</p>', 'Fall in love, dark-browed maidens, But not with Muscovites, For Muscovites are foreign folk, They will bring you only strife.', 20, '{now}', '{now}')");

            // Forest Song UK - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition2UkId}', 1, 'prolog', 'Пролог', '<h1>Пролог</h1><p>Ліс на Волині, в давні часи. Серед лісу озерце, оточене очеретами та осокою. На озерці плавають лілеї.</p>', 'Ліс на Волині, в давні часи. Серед лісу озерце, оточене очеретами та осокою. На озерці плавають лілеї.', 17, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition2UkId}', 2, 'diya-persha', 'Дія перша', '<h1>Дія перша</h1><p>МАВКА виринає з озера. Вона струшує з себе воду, що спадає з неї, мов срібна луска.</p>', 'МАВКА виринає з озера. Вона струшує з себе воду, що спадає з неї, мов срібна луска.', 16, '{now}', '{now}')");

            // Forest Song EN - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition2EnId}', 1, 'prologue', 'Prologue', '<h1>Prologue</h1><p>A forest in Volyn, in ancient times. In the middle of the forest is a small lake, surrounded by reeds and sedge. Water lilies float on the lake.</p>', 'A forest in Volyn, in ancient times. In the middle of the forest is a small lake, surrounded by reeds and sedge. Water lilies float on the lake.', 27, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition2EnId}', 2, 'act-one', 'Act One', '<h1>Act One</h1><p>MAVKA emerges from the lake. She shakes off the water that falls from her like silver scales.</p>', 'MAVKA emerges from the lake. She shakes off the water that falls from her like silver scales.', 17, '{now}', '{now}')");

            // Clean Code EN - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition3EnId}', 1, 'clean-code', 'Clean Code', '<h1>Clean Code</h1><p>There Will Be Code. Code represents the details of the requirements. At some level those details cannot be ignored or abstracted.</p>', 'There Will Be Code. Code represents the details of the requirements. At some level those details cannot be ignored or abstracted.', 22, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition3EnId}', 2, 'meaningful-names', 'Meaningful Names', '<h1>Meaningful Names</h1><p>Use Intention-Revealing Names. The name of a variable, function, or class should answer all the big questions.</p>', 'Use Intention-Revealing Names. The name of a variable, function, or class should answer all the big questions.', 18, '{now}', '{now}')");

            // Clean Code UK - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition3UkId}', 1, 'chystyi-kod', 'Чистий код', '<h1>Чистий код</h1><p>Код буде завжди. Код представляє деталі вимог. На певному рівні ці деталі не можна ігнорувати або абстрагувати.</p>', 'Код буде завжди. Код представляє деталі вимог. На певному рівні ці деталі не можна ігнорувати або абстрагувати.', 16, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition3UkId}', 2, 'zmistovni-nazvy', 'Змістовні назви', '<h1>Змістовні назви</h1><p>Використовуйте назви, що розкривають намір. Назва змінної, функції або класу має відповідати на всі важливі питання.</p>', 'Використовуйте назви, що розкривають намір. Назва змінної, функції або класу має відповідати на всі важливі питання.', 15, '{now}', '{now}')");

            // Design Patterns EN - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition4EnId}', 1, 'introduction', 'Introduction', '<h1>Introduction</h1><p>Designing object-oriented software is hard, and designing reusable object-oriented software is even harder.</p>', 'Designing object-oriented software is hard, and designing reusable object-oriented software is even harder.', 15, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition4EnId}', 2, 'singleton', 'Singleton', '<h1>Singleton</h1><p>Ensure a class only has one instance, and provide a global point of access to it.</p>', 'Ensure a class only has one instance, and provide a global point of access to it.', 16, '{now}', '{now}')");

            // Design Patterns UK - Chapters
            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition4UkId}', 1, 'vstup', 'Вступ', '<h1>Вступ</h1><p>Проектування об''єктно-орієнтованого програмного забезпечення складне, а проектування повторно використовуваного — ще складніше.</p>', 'Проектування об''єктно-орієнтованого програмного забезпечення складне, а проектування повторно використовуваного — ще складніше.', 11, '{now}', '{now}')");

            migrationBuilder.Sql($@"
                INSERT INTO chapters (id, edition_id, chapter_number, slug, title, html, plain_text, word_count, created_at, updated_at)
                VALUES ('{Guid.NewGuid()}', '{edition4UkId}', 2, 'odynochka', 'Одинак', '<h1>Одинак</h1><p>Гарантує, що клас має лише один екземпляр, і надає глобальну точку доступу до нього.</p>', 'Гарантує, що клас має лише один екземпляр, і надає глобальну точку доступу до нього.', 13, '{now}', '{now}')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            var edition1UkId = "bbbbbbbb-0001-0001-0001-000000000001";
            var edition1EnId = "bbbbbbbb-0001-0001-0001-000000000002";
            var edition2UkId = "bbbbbbbb-0002-0002-0002-000000000001";
            var edition2EnId = "bbbbbbbb-0002-0002-0002-000000000002";
            var edition3UkId = "bbbbbbbb-0003-0003-0003-000000000001";
            var edition3EnId = "bbbbbbbb-0003-0003-0003-000000000002";
            var edition4UkId = "bbbbbbbb-0004-0004-0004-000000000001";
            var edition4EnId = "bbbbbbbb-0004-0004-0004-000000000002";

            var work1Id = "aaaaaaaa-0001-0001-0001-000000000001";
            var work2Id = "aaaaaaaa-0002-0002-0002-000000000002";
            var work3Id = "aaaaaaaa-0003-0003-0003-000000000003";
            var work4Id = "aaaaaaaa-0004-0004-0004-000000000004";

            // Delete chapters
            migrationBuilder.Sql($"DELETE FROM chapters WHERE edition_id IN ('{edition1UkId}', '{edition1EnId}', '{edition2UkId}', '{edition2EnId}', '{edition3UkId}', '{edition3EnId}', '{edition4UkId}', '{edition4EnId}')");

            // Delete editions
            migrationBuilder.Sql($"DELETE FROM editions WHERE id IN ('{edition1UkId}', '{edition1EnId}', '{edition2UkId}', '{edition2EnId}', '{edition3UkId}', '{edition3EnId}', '{edition4UkId}', '{edition4EnId}')");

            // Delete works
            migrationBuilder.Sql($"DELETE FROM works WHERE id IN ('{work1Id}', '{work2Id}', '{work3Id}', '{work4Id}')");
        }
    }
}
