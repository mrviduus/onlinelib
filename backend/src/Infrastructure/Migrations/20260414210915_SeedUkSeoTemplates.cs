using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedUkSeoTemplates : Migration
    {
        // UK variants of the 4 EN seeds + extra templates for full coverage:
        //   Author: SeoTitle, SeoDescription (en + uk)
        //   Edition: SeoTitle, SeoDescription (en + uk)
        //   Genre: Description, SeoTitle, SeoDescription (en only — genres are en-keyed)
        //   BlogPost: SeoTitle, SeoDescription (en + uk)
        private static readonly Guid AuthorBioUkId = new("aaaaaaaa-0001-0000-0000-000000000002");
        private static readonly Guid EditionDescriptionUkId = new("aaaaaaaa-0002-0000-0000-000000000002");
        private static readonly Guid EditionRelevanceUkId = new("aaaaaaaa-0003-0000-0000-000000000002");
        private static readonly Guid EditionThemesUkId = new("aaaaaaaa-0004-0000-0000-000000000002");

        private static readonly Guid AuthorSeoTitleEnId = new("aaaaaaaa-0005-0000-0000-000000000001");
        private static readonly Guid AuthorSeoTitleUkId = new("aaaaaaaa-0005-0000-0000-000000000002");
        private static readonly Guid AuthorSeoDescriptionEnId = new("aaaaaaaa-0006-0000-0000-000000000001");
        private static readonly Guid AuthorSeoDescriptionUkId = new("aaaaaaaa-0006-0000-0000-000000000002");

        private static readonly Guid EditionSeoTitleEnId = new("aaaaaaaa-0007-0000-0000-000000000001");
        private static readonly Guid EditionSeoTitleUkId = new("aaaaaaaa-0007-0000-0000-000000000002");
        private static readonly Guid EditionSeoDescriptionEnId = new("aaaaaaaa-0008-0000-0000-000000000001");
        private static readonly Guid EditionSeoDescriptionUkId = new("aaaaaaaa-0008-0000-0000-000000000002");
        private static readonly Guid EditionFaqsEnId = new("aaaaaaaa-0009-0000-0000-000000000001");
        private static readonly Guid EditionFaqsUkId = new("aaaaaaaa-0009-0000-0000-000000000002");

        private static readonly Guid GenreDescriptionEnId = new("aaaaaaaa-0010-0000-0000-000000000001");
        private static readonly Guid GenreSeoTitleEnId = new("aaaaaaaa-0011-0000-0000-000000000001");
        private static readonly Guid GenreSeoDescriptionEnId = new("aaaaaaaa-0012-0000-0000-000000000001");

        private static readonly Guid BlogSeoTitleEnId = new("aaaaaaaa-0013-0000-0000-000000000001");
        private static readonly Guid BlogSeoTitleUkId = new("aaaaaaaa-0013-0000-0000-000000000002");
        private static readonly Guid BlogSeoDescriptionEnId = new("aaaaaaaa-0014-0000-0000-000000000001");
        private static readonly Guid BlogSeoDescriptionUkId = new("aaaaaaaa-0014-0000-0000-000000000002");

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var now = DateTimeOffset.UtcNow;
            // EntityType: 0=Author, 1=Edition, 2=Genre, 3=BlogPost
            // FieldType: 0=Bio, 1=Description, 2=Relevance, 3=Themes, 4=Faqs, 5=SeoTitle, 6=SeoDescription
            // TrustLevel: 0=Manual, 1=Review (default), 2=Auto
            const string model = "claude-sonnet-4-6";

            // ── UK variants of existing 4 EN seeds ──
            const string authorBioUkPrompt = "Ти — SEO-копірайтер для TextStack, безкоштовної онлайн-бібліотеки книжок.\n\nНапиши біографію цього автора українською.\n\nАвтор: {name}\nКниги на TextStack: {books}\nМова: {language}\n\nПравила:\n- Фактологічний, енциклопедичний тон\n- Роки народження/смерті, якщо відомі\n- Головні твори, досягнення\n- Без суб'єктивних оцінок\n- 200–400 слів\n- Українською мовою\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"bio\": \"[200–400 слів: життя, головні твори, стиль, вплив]\"}";
            const string authorBioSchema = "{\"type\":\"object\",\"required\":[\"bio\"],\"properties\":{\"bio\":{\"type\":\"string\",\"minLength\":500,\"maxLength\":5000}}}";

            const string editionDescriptionUkPrompt = "Ти — SEO-копірайтер для TextStack, безкоштовної онлайн-бібліотеки.\n\nНапиши опис сюжету цієї книги українською.\n\nКнига: {title}\nАвтор: {author}\nМова: {language}\nУривок першого розділу: {excerpt}\n\nПравила:\n- Енциклопедичний, фактологічний тон\n- Без суб'єктивних оцінок\n- 150–250 слів\n- Поєднай сюжет + літературне значення\n- Українською мовою\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"description\": \"[150–250 слів: сюжет + літературне значення]\"}";
            const string editionDescriptionSchema = "{\"type\":\"object\",\"required\":[\"description\"],\"properties\":{\"description\":{\"type\":\"string\",\"minLength\":400,\"maxLength\":3000}}}";

            const string editionRelevanceUkPrompt = "Ти — SEO-копірайтер для TextStack.\n\nПоясни, чому ця книга досі актуальна. Пиши українською.\n\nКнига: {title}\nАвтор: {author}\nМова: {language}\n\nПравила:\n- Фактологічний тон\n- 100–150 слів\n- Сучасні паралелі, культурний вплив\n- Українською мовою\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"relevance\": \"[100–150 слів про актуальність]\"}";
            const string editionRelevanceSchema = "{\"type\":\"object\",\"required\":[\"relevance\"],\"properties\":{\"relevance\":{\"type\":\"string\",\"minLength\":300,\"maxLength\":2000}}}";

            const string editionThemesUkPrompt = "Ти — SEO-копірайтер для TextStack.\n\nВибери основні теми цієї книги. Пиши українською.\n\nКнига: {title}\nАвтор: {author}\nМова: {language}\n\nПравила:\n- 5–7 тем\n- Тільки іменникові фрази (напр. \"Провина і спокута\", не \"Досліджує провину\")\n- Українською мовою\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"themes\": [\"Тема 1\", \"Тема 2\", \"Тема 3\", \"Тема 4\", \"Тема 5\"]}";
            const string editionThemesSchema = "{\"type\":\"object\",\"required\":[\"themes\"],\"properties\":{\"themes\":{\"type\":\"array\",\"minItems\":3,\"maxItems\":10,\"items\":{\"type\":\"string\",\"minLength\":3,\"maxLength\":100}}}}";

            // ── SeoTitle / SeoDescription for Author/Edition/Genre/BlogPost ──
            const string authorSeoTitleEnPrompt = "Generate an SEO page title for an author page.\n\nAuthor: {name}\nLanguage: {language}\n\nRules:\n- 50–70 characters\n- Include author name\n- End with \" | TextStack Reader\"\n- Plain text, no markdown\n\nOutput ONLY valid JSON:\n{\"seoTitle\": \"Author Name – Free Books to Read Online | TextStack Reader\"}";
            const string authorSeoTitleUkPrompt = "Згенеруй SEO-заголовок для сторінки автора.\n\nАвтор: {name}\nМова: {language}\n\nПравила:\n- 50–70 символів\n- Включи імʼя автора\n- Закінчи на \" | TextStack Reader\"\n- Plain text, без markdown\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"seoTitle\": \"Імʼя Автора – безкоштовні книги онлайн | TextStack Reader\"}";
            const string seoTitleSchema = "{\"type\":\"object\",\"required\":[\"seoTitle\"],\"properties\":{\"seoTitle\":{\"type\":\"string\",\"minLength\":20,\"maxLength\":120}}}";

            const string authorSeoDescriptionEnPrompt = "Generate a meta description for an author page.\n\nAuthor: {name}\nBooks: {books}\nLanguage: {language}\n\nRules:\n- 140–160 characters\n- Summarize author's work; mention 1–2 flagship books\n- Call-to-action-ish, natural prose\n- Plain text, no markdown\n\nOutput ONLY valid JSON:\n{\"seoDescription\": \"Read free books by {Author Name} online — {short summary}. Start reading now on TextStack.\"}";
            const string authorSeoDescriptionUkPrompt = "Згенеруй мета-опис для сторінки автора.\n\nАвтор: {name}\nКниги: {books}\nМова: {language}\n\nПравила:\n- 140–160 символів\n- Коротко про творчість + 1–2 ключові книги\n- Зрозумілий call-to-action\n- Plain text, без markdown\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"seoDescription\": \"Читай безкоштовно книги {Автор} онлайн — {стислий опис}. Починай на TextStack.\"}";
            const string seoDescriptionSchema = "{\"type\":\"object\",\"required\":[\"seoDescription\"],\"properties\":{\"seoDescription\":{\"type\":\"string\",\"minLength\":80,\"maxLength\":300}}}";

            const string editionSeoTitleEnPrompt = "Generate an SEO page title for a book page.\n\nBook: {title}\nAuthor: {author}\nLanguage: {language}\n\nRules:\n- 50–70 characters\n- Include book title + author\n- End with \" | TextStack Reader\"\n- Plain text, no markdown\n\nOutput ONLY valid JSON:\n{\"seoTitle\": \"Book Title by Author – Read Free | TextStack Reader\"}";
            const string editionSeoTitleUkPrompt = "Згенеруй SEO-заголовок для сторінки книги.\n\nКнига: {title}\nАвтор: {author}\nМова: {language}\n\nПравила:\n- 50–70 символів\n- Включи назву книги + автора\n- Закінчи на \" | TextStack Reader\"\n- Plain text, без markdown\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"seoTitle\": \"Назва Книги — Автор | TextStack Reader\"}";

            const string editionSeoDescriptionEnPrompt = "Generate a meta description for a book page.\n\nBook: {title}\nAuthor: {author}\nLanguage: {language}\nExcerpt: {excerpt}\n\nRules:\n- 140–160 characters\n- Hook the reader, hint at theme\n- No spoilers\n- Plain text, no markdown\n\nOutput ONLY valid JSON:\n{\"seoDescription\": \"Read {title} by {author} free online — {hook}. Start reading on TextStack.\"}";
            const string editionSeoDescriptionUkPrompt = "Згенеруй мета-опис для сторінки книги.\n\nКнига: {title}\nАвтор: {author}\nМова: {language}\nУривок: {excerpt}\n\nПравила:\n- 140–160 символів\n- Зачепи читача, натякни на тему\n- Без спойлерів\n- Plain text, без markdown\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"seoDescription\": \"Читай {title} від {author} безкоштовно — {гак}. Починай на TextStack.\"}";

            const string editionFaqsEnPrompt = "Generate FAQ questions and answers for a book page.\n\nBook: {title}\nAuthor: {author}\nLanguage: {language}\nExcerpt: {excerpt}\n\nRules:\n- 3–5 Q/A pairs\n- Questions readers actually ask (who is the author, what's it about, is it free, reading time, difficulty)\n- Short answers, 1–3 sentences\n- Write in language: {language}\n\nOutput ONLY valid JSON:\n{\"faqs\": [{\"question\": \"...\", \"answer\": \"...\"}, ...]}";
            const string editionFaqsUkPrompt = "Згенеруй FAQ (питання/відповіді) для сторінки книги.\n\nКнига: {title}\nАвтор: {author}\nМова: {language}\nУривок: {excerpt}\n\nПравила:\n- 3–5 Q/A\n- Реальні питання читачів (хто автор, про що книга, чи безкоштовна, час читання, складність)\n- Короткі відповіді, 1–3 речення\n- Українською мовою\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"faqs\": [{\"question\": \"...\", \"answer\": \"...\"}, ...]}";
            const string faqsSchema = "{\"type\":\"object\",\"required\":[\"faqs\"],\"properties\":{\"faqs\":{\"type\":\"array\",\"minItems\":3,\"maxItems\":8,\"items\":{\"type\":\"object\",\"required\":[\"question\",\"answer\"],\"properties\":{\"question\":{\"type\":\"string\",\"minLength\":5,\"maxLength\":300},\"answer\":{\"type\":\"string\",\"minLength\":10,\"maxLength\":1000}}}}}}";

            const string genreDescriptionEnPrompt = "Generate an SEO description for a book genre page.\n\nGenre: {name}\nExample books: {books}\n\nRules:\n- 150–250 words, English\n- What defines this genre (themes, conventions)\n- Why readers love it\n- Mention notable works if provided\n- Factual, encyclopedic tone\n\nOutput ONLY valid JSON:\n{\"description\": \"[150–250 word genre overview]\"}";
            const string genreDescriptionSchema = "{\"type\":\"object\",\"required\":[\"description\"],\"properties\":{\"description\":{\"type\":\"string\",\"minLength\":400,\"maxLength\":3000}}}";

            const string genreSeoTitleEnPrompt = "Generate an SEO title for a genre page.\n\nGenre: {name}\n\nRules:\n- 50–70 characters\n- Highlight \"free books\"\n- End with \" | TextStack Reader\"\n\nOutput ONLY valid JSON:\n{\"seoTitle\": \"{Genre} Books – Read Free Online | TextStack Reader\"}";

            const string genreSeoDescriptionEnPrompt = "Generate a meta description for a genre page.\n\nGenre: {name}\nExample books: {books}\n\nRules:\n- 140–160 characters\n- Hook readers, mention 1 flagship title if available\n- Plain text, no markdown\n\nOutput ONLY valid JSON:\n{\"seoDescription\": \"Browse free {genre} books online — classics and hidden gems. Start reading on TextStack.\"}";

            const string blogSeoTitleEnPrompt = "Generate an SEO title for a blog post.\n\nPost: {title}\nLanguage: {language}\n\nRules:\n- 50–70 characters\n- Keep original title spirit\n- End with \" | TextStack Reader\"\n\nOutput ONLY valid JSON:\n{\"seoTitle\": \"{Title} | TextStack Reader\"}";
            const string blogSeoTitleUkPrompt = "Згенеруй SEO-заголовок для блог-статті.\n\nПост: {title}\nМова: {language}\n\nПравила:\n- 50–70 символів\n- Збережи сенс назви\n- Закінчи на \" | TextStack Reader\"\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"seoTitle\": \"{Назва} | TextStack Reader\"}";

            const string blogSeoDescriptionEnPrompt = "Generate a meta description for a blog post.\n\nPost: {title}\nExcerpt: {excerpt}\nContent snippet: {content}\nLanguage: {language}\n\nRules:\n- 140–160 characters\n- Hook the reader\n- Plain text, no markdown\n\nOutput ONLY valid JSON:\n{\"seoDescription\": \"[140–160 char hook description]\"}";
            const string blogSeoDescriptionUkPrompt = "Згенеруй мета-опис для блог-статті.\n\nПост: {title}\nУривок: {excerpt}\nФрагмент: {content}\nМова: {language}\n\nПравила:\n- 140–160 символів\n- Зачепи читача\n- Plain text, без markdown\n\nПоверни ТІЛЬКИ валідний JSON:\n{\"seoDescription\": \"[140–160 символів зачіпки]\"}";

            // Insert all templates in one batch.
            void Insert(Guid id, int entityType, int fieldType, string lang, string name, string description, string prompt, string schema, int maxTokens, double temperature)
            {
                migrationBuilder.InsertData(
                    table: "seo_templates",
                    columns: new[] { "id", "entity_type", "field_type", "language_code", "name", "description", "prompt_template", "output_schema", "model", "max_tokens", "temperature", "trust_level", "version", "is_active", "created_at", "updated_at" },
                    values: new object[] { id, entityType, fieldType, lang, name, description, prompt, schema, model, maxTokens, temperature, 1, 1, true, now, now });
            }

            // Author UK bio
            Insert(AuthorBioUkId, 0, 0, "uk", "Біографія автора (UK)", "200–400 слів: життя, твори, стиль, вплив.", authorBioUkPrompt, authorBioSchema, 4096, 0.7);

            // Edition UK description/relevance/themes
            Insert(EditionDescriptionUkId, 1, 1, "uk", "Опис книги (UK)", "150–250 слів: сюжет + значення.", editionDescriptionUkPrompt, editionDescriptionSchema, 4096, 0.7);
            Insert(EditionRelevanceUkId, 1, 2, "uk", "Актуальність (UK)", "100–150 слів: сучасні паралелі.", editionRelevanceUkPrompt, editionRelevanceSchema, 2048, 0.7);
            Insert(EditionThemesUkId, 1, 3, "uk", "Теми (UK)", "5–7 тем, іменникові фрази.", editionThemesUkPrompt, editionThemesSchema, 1024, 0.7);

            // Author SeoTitle / SeoDescription EN + UK
            Insert(AuthorSeoTitleEnId, 0, 5, "en", "Author SEO Title (EN)", "50–70 char page title for author page.", authorSeoTitleEnPrompt, seoTitleSchema, 256, 0.7);
            Insert(AuthorSeoTitleUkId, 0, 5, "uk", "SEO-заголовок автора (UK)", "50–70 символів.", authorSeoTitleUkPrompt, seoTitleSchema, 256, 0.7);
            Insert(AuthorSeoDescriptionEnId, 0, 6, "en", "Author SEO Description (EN)", "140–160 char meta description.", authorSeoDescriptionEnPrompt, seoDescriptionSchema, 512, 0.7);
            Insert(AuthorSeoDescriptionUkId, 0, 6, "uk", "SEO-опис автора (UK)", "140–160 символів.", authorSeoDescriptionUkPrompt, seoDescriptionSchema, 512, 0.7);

            // Edition SeoTitle / SeoDescription / Faqs EN + UK
            Insert(EditionSeoTitleEnId, 1, 5, "en", "Edition SEO Title (EN)", "50–70 char page title for book page.", editionSeoTitleEnPrompt, seoTitleSchema, 256, 0.7);
            Insert(EditionSeoTitleUkId, 1, 5, "uk", "SEO-заголовок книги (UK)", "50–70 символів.", editionSeoTitleUkPrompt, seoTitleSchema, 256, 0.7);
            Insert(EditionSeoDescriptionEnId, 1, 6, "en", "Edition SEO Description (EN)", "140–160 char meta description.", editionSeoDescriptionEnPrompt, seoDescriptionSchema, 512, 0.7);
            Insert(EditionSeoDescriptionUkId, 1, 6, "uk", "SEO-опис книги (UK)", "140–160 символів.", editionSeoDescriptionUkPrompt, seoDescriptionSchema, 512, 0.7);
            Insert(EditionFaqsEnId, 1, 4, "en", "Edition FAQs (EN)", "3–5 Q/A pairs for book page.", editionFaqsEnPrompt, faqsSchema, 2048, 0.7);
            Insert(EditionFaqsUkId, 1, 4, "uk", "FAQ книги (UK)", "3–5 питань-відповідей.", editionFaqsUkPrompt, faqsSchema, 2048, 0.7);

            // Genre Description / SeoTitle / SeoDescription (EN only — genres are en-keyed)
            Insert(GenreDescriptionEnId, 2, 1, "en", "Genre Description (EN)", "150–250 word genre overview.", genreDescriptionEnPrompt, genreDescriptionSchema, 2048, 0.7);
            Insert(GenreSeoTitleEnId, 2, 5, "en", "Genre SEO Title (EN)", "50–70 char page title.", genreSeoTitleEnPrompt, seoTitleSchema, 256, 0.7);
            Insert(GenreSeoDescriptionEnId, 2, 6, "en", "Genre SEO Description (EN)", "140–160 char meta description.", genreSeoDescriptionEnPrompt, seoDescriptionSchema, 512, 0.7);

            // BlogPost SeoTitle / SeoDescription EN + UK
            Insert(BlogSeoTitleEnId, 3, 5, "en", "Blog SEO Title (EN)", "50–70 char page title.", blogSeoTitleEnPrompt, seoTitleSchema, 256, 0.7);
            Insert(BlogSeoTitleUkId, 3, 5, "uk", "SEO-заголовок блогу (UK)", "50–70 символів.", blogSeoTitleUkPrompt, seoTitleSchema, 256, 0.7);
            Insert(BlogSeoDescriptionEnId, 3, 6, "en", "Blog SEO Description (EN)", "140–160 char meta description.", blogSeoDescriptionEnPrompt, seoDescriptionSchema, 512, 0.7);
            Insert(BlogSeoDescriptionUkId, 3, 6, "uk", "SEO-опис блогу (UK)", "140–160 символів.", blogSeoDescriptionUkPrompt, seoDescriptionSchema, 512, 0.7);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            var ids = new[]
            {
                new Guid("aaaaaaaa-0001-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0002-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0003-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0004-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0005-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0005-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0006-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0006-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0007-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0007-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0008-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0008-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0009-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0009-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0010-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0011-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0012-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0013-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0013-0000-0000-000000000002"),
                new Guid("aaaaaaaa-0014-0000-0000-000000000001"),
                new Guid("aaaaaaaa-0014-0000-0000-000000000002"),
            };
            foreach (var id in ids)
                migrationBuilder.DeleteData(table: "seo_templates", keyColumn: "id", keyValue: id);
        }
    }
}
