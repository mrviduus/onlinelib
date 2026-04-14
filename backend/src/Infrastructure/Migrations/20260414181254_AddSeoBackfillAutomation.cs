using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSeoBackfillAutomation : Migration
    {
        // Fixed ID for singleton settings row (matches SeoBackfillSettings.FixedId)
        private static readonly Guid SettingsId = new("44444444-4444-4444-4444-444444444444");
        // Fixed seed template IDs (deterministic, safe for admin panel references)
        private static readonly Guid AuthorBioEnId = new("aaaaaaaa-0001-0000-0000-000000000001");
        private static readonly Guid EditionDescriptionEnId = new("aaaaaaaa-0002-0000-0000-000000000001");
        private static readonly Guid EditionRelevanceEnId = new("aaaaaaaa-0003-0000-0000-000000000001");
        private static readonly Guid EditionThemesEnId = new("aaaaaaaa-0004-0000-0000-000000000001");

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "seo_source",
                table: "genres",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "seo_source",
                table: "editions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "seo_source",
                table: "blog_posts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "seo_source",
                table: "authors",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "seo_backfill_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity_type = table.Column<int>(type: "integer", nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target_fields = table.Column<string[]>(type: "text[]", nullable: false),
                    template_ids = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    template_versions = table.Column<int[]>(type: "integer[]", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    input_snapshot = table.Column<string>(type: "jsonb", nullable: true),
                    rendered_prompts = table.Column<string>(type: "jsonb", nullable: true),
                    raw_outputs = table.Column<string>(type: "jsonb", nullable: true),
                    generated_content = table.Column<string>(type: "jsonb", nullable: true),
                    before_snapshot = table.Column<string>(type: "jsonb", nullable: true),
                    after_snapshot = table.Column<string>(type: "jsonb", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    triggered_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    requires_review = table.Column<bool>(type: "boolean", nullable: false),
                    approved_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seo_backfill_jobs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "seo_backfill_settings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false),
                    jobs_per_run = table.Column<int>(type: "integer", nullable: false),
                    interval_seconds = table.Column<int>(type: "integer", nullable: false),
                    language_filter = table.Column<string[]>(type: "text[]", nullable: false),
                    entity_type_filter = table.Column<string[]>(type: "text[]", nullable: false),
                    ssg_rebuild_batch_minutes = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seo_backfill_settings", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "seo_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity_type = table.Column<int>(type: "integer", nullable: false),
                    field_type = table.Column<int>(type: "integer", nullable: false),
                    language_code = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    prompt_template = table.Column<string>(type: "text", nullable: false),
                    output_schema = table.Column<string>(type: "jsonb", nullable: false),
                    model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    max_tokens = table.Column<int>(type: "integer", nullable: false),
                    temperature = table.Column<double>(type: "double precision", nullable: false),
                    trust_level = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seo_templates", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_seo_backfill_jobs_entity_type_entity_id",
                table: "seo_backfill_jobs",
                columns: new[] { "entity_type", "entity_id" });

            migrationBuilder.CreateIndex(
                name: "ix_seo_backfill_jobs_status_created_at",
                table: "seo_backfill_jobs",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_seo_templates_entity_type_field_type_language_code_is_active",
                table: "seo_templates",
                columns: new[] { "entity_type", "field_type", "language_code", "is_active" });

            // Seed singleton settings row (Enabled=false — admin flips on after review)
            var now = DateTimeOffset.UtcNow;
            migrationBuilder.InsertData(
                table: "seo_backfill_settings",
                columns: new[] { "id", "enabled", "jobs_per_run", "interval_seconds", "language_filter", "entity_type_filter", "ssg_rebuild_batch_minutes", "updated_at" },
                values: new object[] { SettingsId, false, 5, 60, new string[0], new string[0], 5, now });

            // Seed 4 EN templates — prompts extracted from infra/scripts/seo-generate.sh.
            // EntityType: 0=Author, 1=Edition, 2=Genre, 3=BlogPost
            // FieldType: 0=Bio, 1=Description, 2=Relevance, 3=Themes, 4=Faqs
            // TrustLevel: 0=Manual, 1=Review (default — admin approves each job), 2=Auto
            const string authorBioPrompt = "You are an SEO content writer for TextStack, a free online book library.\n\nGenerate a biography for this author. Write in the SAME LANGUAGE indicated below.\n\nAuthor: {name}\nPublished books on TextStack: {books}\nLanguage: {language}\n\nRules:\n- Factual, encyclopedic tone\n- Include birth/death years if known\n- Mention major works and achievements\n- No subjective superlatives\n- 200-400 words\n- Write in language: {language}\n\nOutput ONLY valid JSON:\n{\"bio\": \"[200-400 word biography covering life, major works, literary style, influence]\"}";

            const string authorBioSchema = "{\"type\":\"object\",\"required\":[\"bio\"],\"properties\":{\"bio\":{\"type\":\"string\",\"minLength\":500,\"maxLength\":5000}}}";

            const string editionDescriptionPrompt = "You are an SEO content writer for TextStack, a free online book library.\n\nGenerate a plot description for this book. Write in the SAME LANGUAGE as the book.\n\nBook: {title}\nAuthor: {author}\nLanguage: {language}\nFirst chapter excerpt: {excerpt}\n\nRules:\n- Factual, encyclopedic tone\n- No subjective superlatives\n- 150-250 words\n- Combine plot summary + literary significance\n- Write in language: {language}\n\nOutput ONLY valid JSON:\n{\"description\": \"[150-250 word plot summary and literary significance]\"}";

            const string editionDescriptionSchema = "{\"type\":\"object\",\"required\":[\"description\"],\"properties\":{\"description\":{\"type\":\"string\",\"minLength\":400,\"maxLength\":3000}}}";

            const string editionRelevancePrompt = "You are an SEO content writer for TextStack, a free online book library.\n\nExplain why this book is still relevant today. Write in the SAME LANGUAGE as the book.\n\nBook: {title}\nAuthor: {author}\nLanguage: {language}\n\nRules:\n- Factual, encyclopedic tone\n- 100-150 words\n- Modern connections, cultural influence, why readers today should care\n- Write in language: {language}\n\nOutput ONLY valid JSON:\n{\"relevance\": \"[100-150 word relevance essay]\"}";

            const string editionRelevanceSchema = "{\"type\":\"object\",\"required\":[\"relevance\"],\"properties\":{\"relevance\":{\"type\":\"string\",\"minLength\":300,\"maxLength\":2000}}}";

            const string editionThemesPrompt = "You are an SEO content writer for TextStack, a free online book library.\n\nExtract the main themes of this book. Write in the SAME LANGUAGE as the book.\n\nBook: {title}\nAuthor: {author}\nLanguage: {language}\n\nRules:\n- 5-7 themes\n- Noun phrases only (e.g. \"Guilt and redemption\" not \"Explores guilt\")\n- Write in language: {language}\n\nOutput ONLY valid JSON:\n{\"themes\": [\"Theme 1\", \"Theme 2\", \"Theme 3\", \"Theme 4\", \"Theme 5\"]}";

            const string editionThemesSchema = "{\"type\":\"object\",\"required\":[\"themes\"],\"properties\":{\"themes\":{\"type\":\"array\",\"minItems\":3,\"maxItems\":10,\"items\":{\"type\":\"string\",\"minLength\":3,\"maxLength\":100}}}}";

            migrationBuilder.InsertData(
                table: "seo_templates",
                columns: new[] { "id", "entity_type", "field_type", "language_code", "name", "description", "prompt_template", "output_schema", "model", "max_tokens", "temperature", "trust_level", "version", "is_active", "created_at", "updated_at" },
                values: new object[] { AuthorBioEnId, 0, 0, "en", "Author Bio (EN)", "200-400 word encyclopedic biography covering life, works, style, influence.", authorBioPrompt, authorBioSchema, "claude-sonnet-4-6", 4096, 0.7, 1, 1, true, now, now });

            migrationBuilder.InsertData(
                table: "seo_templates",
                columns: new[] { "id", "entity_type", "field_type", "language_code", "name", "description", "prompt_template", "output_schema", "model", "max_tokens", "temperature", "trust_level", "version", "is_active", "created_at", "updated_at" },
                values: new object[] { EditionDescriptionEnId, 1, 1, "en", "Edition Description (EN)", "150-250 word plot summary + literary significance.", editionDescriptionPrompt, editionDescriptionSchema, "claude-sonnet-4-6", 4096, 0.7, 1, 1, true, now, now });

            migrationBuilder.InsertData(
                table: "seo_templates",
                columns: new[] { "id", "entity_type", "field_type", "language_code", "name", "description", "prompt_template", "output_schema", "model", "max_tokens", "temperature", "trust_level", "version", "is_active", "created_at", "updated_at" },
                values: new object[] { EditionRelevanceEnId, 1, 2, "en", "Edition Relevance (EN)", "100-150 words: modern connections, cultural influence.", editionRelevancePrompt, editionRelevanceSchema, "claude-sonnet-4-6", 2048, 0.7, 1, 1, true, now, now });

            migrationBuilder.InsertData(
                table: "seo_templates",
                columns: new[] { "id", "entity_type", "field_type", "language_code", "name", "description", "prompt_template", "output_schema", "model", "max_tokens", "temperature", "trust_level", "version", "is_active", "created_at", "updated_at" },
                values: new object[] { EditionThemesEnId, 1, 3, "en", "Edition Themes (EN)", "5-7 noun-phrase themes for the book.", editionThemesPrompt, editionThemesSchema, "claude-sonnet-4-6", 1024, 0.7, 1, 1, true, now, now });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "seo_backfill_jobs");

            migrationBuilder.DropTable(
                name: "seo_backfill_settings");

            migrationBuilder.DropTable(
                name: "seo_templates");

            migrationBuilder.DropColumn(
                name: "seo_source",
                table: "genres");

            migrationBuilder.DropColumn(
                name: "seo_source",
                table: "editions");

            migrationBuilder.DropColumn(
                name: "seo_source",
                table: "blog_posts");

            migrationBuilder.DropColumn(
                name: "seo_source",
                table: "authors");
        }
    }
}
