using System.Threading.RateLimiting;
using Api.Endpoints;
using Api.Language;
using Api.Middleware;
using Api.Sites;
using Application;
using Application.AdminAuth;
using Application.Common.Interfaces;
using Application.TextStack;
using Domain.Enums;
using Infrastructure.Persistence;
using Infrastructure.Services;
using Infrastructure.Telemetry;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.FileProviders;
using Npgsql;
using TextStack.Ai.Rag;
using TextStack.Search;
using TextStack.Search.Abstractions;
using TextStack.Search.Meilisearch;
using TextStack.Tts;
using TextStack.Vocabulary;
using Api.Services;
using Application.Auth;
using Application.Search;
using OpenTelemetry.Trace;
using Scalar.AspNetCore;
using TextStack.Ai.Tools;

var builder = WebApplication.CreateBuilder(args);

// Match nginx client_max_body_size (500MB) + per-user storage quota.
// Default Kestrel cap is 30MB → users hit 413 on real-world PDFs.
const long MaxUploadBytes = 500L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxUploadBytes);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = MaxUploadBytes;
    o.ValueLengthLimit = int.MaxValue;
    o.MultipartHeadersLengthLimit = int.MaxValue;
});

// OpenTelemetry
builder.Services.AddTextStackTelemetry(
    builder.Configuration,
    "textstack-api",
    tracing => tracing
        .AddAspNetCoreInstrumentation(options =>
        {
            options.RecordException = true;
            options.EnrichWithHttpRequest = (activity, request) =>
            {
                activity.SetTag("http.client_ip", request.HttpContext.Connection.RemoteIpAddress?.ToString());
            };
        })
        .AddHttpClientInstrumentation());
builder.Logging.AddTelemetryLogging(builder.Configuration, "textstack-api");

var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? [
        "http://localhost:5173", "http://general.localhost", "http://general.localhost:5173",
        "http://localhost:81", "http://admin.localhost", "http://admin.localhost:81",
        "https://textstack.app", "https://textstack.dev"
    ];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddOpenApi();

// Application layer
builder.Services.AddApplication();
builder.Services.AddSingleton<TextStack.Ai.EvalSuite.EvalSuiteRunner>();
builder.Services.AddSingleton<TextStack.Ai.EvalSuite.RagEvalRunner>();
builder.Services.AddSingleton<TextStack.Ai.EvalSuite.ToolCallEvalRunner>();
builder.Services.AddSingleton<TextStack.Ai.EvalSuite.StudyBuddyEvalRunner>();
builder.Services.AddSingleton<TextStack.Ai.EvalSuite.CriticDefectEvalRunner>();
builder.Services.AddSingleton<TextStack.Ai.EvalSuite.CrewAbEvalRunner>();
// Tool catalogue (AI-029/030): scans Application for ITool impls; dispatch is schema-validated.
builder.Services.AddAiTools(typeof(Application.Tools.GetChapterTool).Assembly);
// Agent loop engine (Phase 6, AI-034). Concrete agents (StudyBuddy, AI-035) build on it.
TextStack.Ai.Agents.ServiceCollectionExtensions.AddAiAgents(builder.Services);
builder.Services.AddScoped<Application.Agents.StudyBuddyAgent>();
// Crew specialists (Phase 7, AI-041): single-call IAgent<TIn,TOut> sub-agents the content crews
// (AI-042/043) compose via CrewTasks.Of. Stateless + ILlmService is a singleton, so singleton is fine.
builder.Services.AddSingleton<Application.Agents.ResearcherAgent>();
builder.Services.AddSingleton<Application.Agents.DrafterAgent>();
builder.Services.AddSingleton<Application.Agents.CriticAgent>();
builder.Services.AddSingleton<Application.Agents.EditorAgent>();
// Single-call A/B baseline (Phase 7, AI-046): the "A" arm of the crew-vs-single-call eval — one ILlmService
// call that writes a field directly under the crew's full brief contract. Stateless singleton like the specialists.
builder.Services.AddSingleton<Application.Agents.BaselineFieldAgent>();
// AutoPublish crew (Phase 7, AI-042): in-process admin path that runs the specialists over ILlmService to
// generate SEO prose for an Edition. Scoped because it persists via the scoped IAgentRunWriter (per-request
// DbContext). The legacy bash + Claude-CLI poller stays the default; this is the observable, traced alternative.
// Shared per-field crew runner (Phase 7, AI-043): the 4-stage plan + fail-closed gate + agent_run persistence,
// extracted from AutoPublishCrew so both AutoPublish and SEO crews delegate to it. Scoped (scoped IAgentRunWriter).
builder.Services.AddScoped<Application.Agents.FieldCrew>();
builder.Services.AddScoped<Application.Agents.AutoPublishCrew>();
// SEO crew (Phase 7, AI-043): in-process admin path that generates ONE SEO prose field over ILlmService and
// routes it through the SeoBackfillJob apply path. The legacy seo-backfill poller stays the default + untouched.
builder.Services.AddScoped<Application.Agents.SeoCrew>();
builder.Services.AddAuthSettings(builder.Configuration);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is required");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString, o => o.UseVector())
        .UseSnakeCaseNamingConvention()
        .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));

builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

// File storage
var storagePath = builder.Configuration["Storage:RootPath"] ?? "/storage";
builder.Services.AddSingleton<IFileStorageService>(new LocalFileStorageService(storagePath));

// Search library
builder.Services.AddTextStackSearch();
var searchProvider = builder.Configuration["Search:Provider"] ?? "postgres";
if (searchProvider == "meilisearch")
    builder.Services.AddMeilisearchProvider(options =>
        builder.Configuration.GetSection("Search:Meilisearch").Bind(options));
else
    builder.Services.AddPostgresFtsProvider(
        _ => () => new NpgsqlConnection(connectionString),
        options => options.ConnectionString = connectionString);

// RAG vector retrieval (Phase 4). Raw Npgsql like the search provider; query embedded via
// IEmbeddingService (registered in AddApplication). Used by the admin debug endpoint (AI-022).
builder.Services.AddRagRetrieval(_ => () => new NpgsqlConnection(connectionString));
// Spoiler-safe context builder (AI-024): resolves lastRead + gates chunks + private corpus.
builder.Services.AddScoped<Application.Rag.RagContextService>();
// "Ask this book" orchestration (AI-025): context + LLM gateway → grounded answer with citations.
builder.Services.AddScoped<Application.Rag.RagAskService>();
builder.Services.AddScoped<Application.Rag.IRagAskService>(sp => sp.GetRequiredService<Application.Rag.RagAskService>());

// Reindex service (used by CLI)
builder.Services.AddScoped<SearchReindexService>();

// Vocabulary SRS library
builder.Services.AddTextStackVocabulary(options =>
{
    options.OllamaBaseUrl = builder.Configuration["Ollama:BaseUrl"] ?? "http://localhost:11434";
    options.OllamaModel = builder.Configuration["Ollama:Model"] ?? "gemma4:e2b";
    options.OllamaTimeoutSeconds = builder.Configuration.GetValue("Ollama:TimeoutSeconds", 30);
});

// Image optimization
builder.Services.AddSingleton<IImageOptimizer, ImageOptimizer>();

// Site resolution
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ISiteResolver, SiteResolver>();

// TextStack import
builder.Services.AddScoped<TextStackImportService>();

// User books
builder.Services.AddScoped<Application.UserBooks.UserBookService>();
builder.Services.AddScoped<Application.UserBooks.MetadataService>();
builder.Services.AddScoped<Application.UserBooks.TagService>();
builder.Services.AddScoped<Application.Collections.CollectionService>();
builder.Services.AddScoped<Application.UserBooks.BulkActionService>();
builder.Services.AddScoped<Application.UserBooks.BookStatsService>();
builder.Services.AddScoped<Application.UserBooks.UserBookSearchService>();
builder.Services.AddScoped<Application.Library.LibraryShelvesService>();

// Standard Ebooks sync
builder.Services.AddHttpClient<StandardEbooksSyncService>();
builder.Services.AddScoped<StandardEbooksSyncService>();

// Email (Resend)
builder.Services.Configure<EmailSettings>(options =>
{
    options.ResendApiKey = builder.Configuration["Resend:ApiKey"] ?? "";
    options.FromEmail = builder.Configuration["Resend:FromEmail"] ?? "noreply@textstack.app";
    options.BaseUrl = builder.Configuration["App:BaseUrl"] ?? "https://textstack.app";
    options.AdminAlertEmail = builder.Configuration["Resend:AdminAlertEmail"] ?? "";
});
builder.Services.AddHttpClient<IEmailService, ResendEmailService>();

// HttpClient for translation proxy
builder.Services.AddHttpClient();

// TTS
builder.Services.Configure<TtsConfiguration>(builder.Configuration.GetSection("Tts"));
builder.Services.AddSingleton<ITtsService, EdgeTtsService>();
builder.Services.AddHostedService(sp => (EdgeTtsService)sp.GetRequiredService<ITtsService>());


// SSG periodic rebuild
builder.Services.AddHostedService<SsgPeriodicRebuildWorker>();

// Vocabulary anti-spiral: periodic auto-retire sweep (F4)
builder.Services.AddHostedService<AutoRetireSweeperWorker>();

// Vocabulary anti-spiral: daily-cap pending → SRS reconciler (F2)
builder.Services.AddHostedService<DailyCapReconcilerWorker>();

// Vocabulary anti-spiral: one-shot seed of word_frequencies from embedded gz (F1)
builder.Services.AddHostedService<WordFrequencyLoaderWorker>();

// Vocabulary anti-spiral: 24h cluster candidate builder (F3)
builder.Services.AddHostedService<ClusterCandidateBuilderWorker>();

// Rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("admin-login", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 5;
        opt.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("user-login", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 10;
        opt.QueueLimit = 0;
    });
    // Device Authorization Grant (RFC 8628, AI-050a) — all per-IP.
    // device-code: CLI requests a device_code; one per CLI session, 5/min is ample.
    options.AddPolicy("device-code", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 5,
            QueueLimit = 0,
        });
    });
    // device-token: CLI polls the token endpoint ~every 5s (interval); 12/min covers
    // honest polling with headroom and still caps scripted abuse.
    options.AddPolicy("device-token", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 12,
            QueueLimit = 0,
        });
    });
    // device-approve: authed consent action; one submit per CLI session. 10/min per IP.
    options.AddPolicy("device-approve", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 10,
            QueueLimit = 0,
        });
    });
    // Per-IP partition — bot with one IP can't exhaust the limit for everyone.
    // 3 guest-creates per 5min per IP: covers legit shared-WiFi cases, blocks scripted abuse.
    // ForwardedHeaders runs before RateLimiter in the pipeline, so RemoteIpAddress is the real client.
    options.AddPolicy("guest-session", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(5),
            PermitLimit = 3,
            QueueLimit = 0,
        });
    });
    // TTS synthesis — per-IP cap. Generous enough for bursty vocab-review /
    // reader-tap usage (~2/s average, tolerates ~20-req bursts via window
    // timing), but blocks scripted abuse hammering the upstream Bing WS.
    // ETag + server+client cache mean most requests are cheap; this limit
    // primarily protects synthesis (uncached) throughput.
    options.AddPolicy("tts", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 120,
            QueueLimit = 0,
        });
    });
    // TTS voices list — cheap (served from 24h server cache), typically
    // called once per session at voice-picker mount. Separate bucket with
    // a much higher cap so a user burning through synthesis budget can
    // still open the voice picker.
    options.AddPolicy("tts-voices", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 600,
            QueueLimit = 0,
        });
    });
    // Translation — per-IP. OpenAI is the upstream cost; users
    // typically call 1-3 times per reading session via SelectionToolbar.
    // 30/min is generous for normal UX, blocks scripted scraping of the
    // translation service.
    options.AddPolicy("translate", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 30,
            QueueLimit = 0,
        });
    });
    // Dictionary lookup — per-IP. Proxies Free Dictionary API (cheap,
    // public). Users tap words rapidly while reading; 60/min fits the
    // natural pace and still caps scripted abuse.
    options.AddPolicy("dictionary", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 60,
            QueueLimit = 0,
        });
    });
    // /explain — Claude/OpenAI-backed contextual explanation. Paid API
    // call per miss (cache fronts it). 20/min per IP is plenty for
    // active reading; anything higher smells like scripting.
    options.AddPolicy("explain", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 20,
            QueueLimit = 0,
        });
    });
    // "Ask this book" (RAG) — one LLM call per request, per-user reading. 30/min per IP is
    // generous for genuine use and caps scripted abuse.
    options.AddPolicy("rag.ask", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 30,
            QueueLimit = 0,
        });
    });
    // Study Buddy agent (AI-037): each run is several LLM calls, so a tighter per-IP limit.
    options.AddPolicy("studybuddy", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 8,
            QueueLimit = 0,
        });
    });
    // AutoPublish crew (AI-042): an admin generate is TWO 4-stage crews = 8 LLM calls, so a tight per-IP cap.
    // Mirrors the studybuddy policy shape; it sits behind admin auth too, this is just runaway protection.
    options.AddPolicy("autopublish.crew", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 4,
            QueueLimit = 0,
        });
    });
    // SEO crew (AI-043): one 4-stage crew = 4 LLM calls per admin generate. Same tight per-IP cap as
    // autopublish.crew; sits behind admin auth too, this is just runaway protection.
    options.AddPolicy("seo.crew", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(1),
            PermitLimit = 4,
            QueueLimit = 0,
        });
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Emit Retry-After so clients can back off intelligently instead of
    // hammering in a tight retry loop. RateLimiter exposes the metadata
    // via lease.TryGetMetadata when available.
    options.OnRejected = (context, ct) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            var seconds = (int)Math.Ceiling(retryAfter.TotalSeconds);
            context.HttpContext.Response.Headers.RetryAfter = seconds.ToString();
        }
        return ValueTask.CompletedTask;
    };
});

// Validate required config at startup
if (!builder.Environment.IsEnvironment("Test"))
{
    var jwtSecret = builder.Configuration["Jwt:SecretKey"];
    if (string.IsNullOrEmpty(jwtSecret))
        throw new InvalidOperationException("Jwt:SecretKey is required. Set JWT_SECRET env var.");

    var googleClientId = builder.Configuration["Google:ClientId"];
    if (string.IsNullOrEmpty(googleClientId))
        throw new InvalidOperationException("Google:ClientId is required. Set GOOGLE_CLIENT_ID env var.");
}

var app = builder.Build();

// Skip migrations in Test environment (uses InMemory DB)
if (!app.Environment.IsEnvironment("Test"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

// Forward headers from reverse proxy (nginx/cloudflare)
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
// Trust all proxies in production (behind nginx/cloudflare)
forwardedHeadersOptions.KnownIPNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

app.UseCors();
app.UseRateLimiter();
app.UseExceptionMiddleware();

// Static files for uploaded content (author photos, book covers)
if (!Directory.Exists(storagePath))
{
    Directory.CreateDirectory(storagePath);
}
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(storagePath),
    RequestPath = "/storage"
});

// Health check before site resolution (for infra probes)
app.MapGet("/health", async (AppDbContext db) =>
{
    try
    {
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        return Results.Ok("healthy");
    }
    catch
    {
        return Results.StatusCode(503);
    }
});

// Granular readiness probe — per-component status for ops dashboards.
// db + storage are critical (503 on failure); ollama is soft (degraded, still 200).
app.MapGet("/health/ready", async (AppDbContext db, IHttpClientFactory httpFactory, IConfiguration cfg, CancellationToken ct) =>
{
    var started = DateTimeOffset.UtcNow;
    var components = new Dictionary<string, object>();
    var criticalOk = true;

    try
    {
        await db.Database.ExecuteSqlRawAsync("SELECT 1", ct);
        components["db"] = new { status = "ok" };
    }
    catch (Exception ex)
    {
        components["db"] = new { status = "down", error = ex.GetType().Name };
        criticalOk = false;
    }

    try
    {
        var root = cfg["Storage:RootPath"] ?? "/storage";
        var probe = Path.Combine(root, ".health-probe");
        await File.WriteAllTextAsync(probe, started.ToString("O"), ct);
        File.Delete(probe);
        components["storage"] = new { status = "ok", path = root };
    }
    catch (Exception ex)
    {
        components["storage"] = new { status = "down", error = ex.GetType().Name };
        criticalOk = false;
    }

    try
    {
        var baseUrl = cfg["Ollama:BaseUrl"] ?? "http://localhost:11434";
        using var client = httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(2);
        var resp = await client.GetAsync($"{baseUrl}/api/tags", ct);
        components["ollama"] = resp.IsSuccessStatusCode
            ? new { status = "ok" }
            : new { status = "degraded", code = (int)resp.StatusCode };
    }
    catch
    {
        components["ollama"] = new { status = "degraded" };
    }

    var elapsed = DateTimeOffset.UtcNow - started;
    var payload = new
    {
        status = criticalOk ? "ready" : "unready",
        timestamp = started,
        latencyMs = (int)elapsed.TotalMilliseconds,
        components,
    };
    return criticalOk ? Results.Ok(payload) : Results.Json(payload, statusCode: 503);
});

// Site resolution middleware
app.UseSiteContext();

// Language resolution middleware (after site context)
app.UseLanguageContext();

// Explicit routing after middleware so path rewriting works
app.UseRouting();

// Guest activity tracking (update LastActiveAt, debounced hourly)
app.UseMiddleware<Api.Middleware.GuestActivityMiddleware>();

// Admin auth middleware - protect /admin/* except /admin/auth/*
app.UseWhen(
    ctx => ctx.Request.Path.StartsWithSegments("/admin")
        && !ctx.Request.Path.StartsWithSegments("/admin/auth"),
    branch => branch.UseAdminAuth());

app.MapAdminAuthEndpoints();
app.MapAdminEndpoints();
app.MapAdminAuthorsEndpoints();
app.MapAdminGenresEndpoints();
app.MapAdminSsgRebuildEndpoints();
app.MapAdminAutoPublishEndpoints();
app.MapAdminSeoBackfillEndpoints();
app.MapAdminLintEndpoints();
app.MapAdminSettingsEndpoints();
app.MapBooksEndpoints();
app.MapPodcastEndpoints();
app.MapSearchEndpoints();
app.MapAuthorsEndpoints();
app.MapGenresEndpoints();
app.MapSiteEndpoints();
app.MapSeoEndpoints();
app.MapSsgEndpoints();
app.MapAuthEndpoints();
app.MapDeviceAuthEndpoints();
app.MapMcpManifestEndpoints();
app.MapProfileEndpoints();
app.MapUserDataEndpoints();
app.MapHighlightsEndpoints();
app.MapTranslationEndpoints();
app.MapExplainEndpoints();
app.MapDictionaryEndpoints();
app.MapUserBooksEndpoints();
app.MapLibraryShelvesEndpoints();
app.MapCollectionsEndpoints();
app.MapReadingTrackingEndpoints();
app.MapAdminBookQualityEndpoints();
app.MapAdminAiQualityEndpoints();
app.MapAdminRagEndpoints();
app.MapAskEndpoints();
app.MapStudyBuddyEndpoints();
app.MapVocabularyEndpoints();
app.MapTtsEndpoints();
app.MapExportEndpoints();
app.MapInternalEndpoints();
app.MapInternalSeoEndpoints();

// CLI: import-textstack command
if (args.Length > 0 && args[0] == "import-textstack")
{
    if (args.Length < 2)
    {
        Console.WriteLine("Usage: dotnet run import-textstack <book-path>");
        return;
    }

    var bookPath = args[1];
    if (!Directory.Exists(bookPath))
    {
        Console.WriteLine($"Directory not found: {bookPath}");
        return;
    }

    using var cliScope = app.Services.CreateScope();
    var db = cliScope.ServiceProvider.GetRequiredService<IAppDbContext>();
    var importService = cliScope.ServiceProvider.GetRequiredService<TextStackImportService>();

    // Get "general" site
    var site = await db.Sites.FirstOrDefaultAsync(s => s.Code == "general");
    if (site == null)
    {
        Console.WriteLine("Site 'general' not found");
        return;
    }

    Console.WriteLine($"Importing from: {bookPath}");
    var result = await importService.ImportBookAsync(site.Id, bookPath, CancellationToken.None);

    if (result.WasSkipped)
        Console.WriteLine("Book already imported, skipped.");
    else if (result.Error != null)
        Console.WriteLine($"Error: {result.Error}");
    else
        Console.WriteLine($"Success! Edition: {result.EditionId}, Chapters: {result.ChapterCount}");

    return;
}

// CLI: optimize-images command
if (args.Length > 0 && args[0] == "optimize-images")
{
    var dryRun = args.Contains("--dry-run");
    if (dryRun) Console.WriteLine("DRY RUN — no changes will be made\n");

    using var cliScope = app.Services.CreateScope();
    var db = cliScope.ServiceProvider.GetRequiredService<IAppDbContext>();
    var storage = cliScope.ServiceProvider.GetRequiredService<IFileStorageService>();
    var optimizer = cliScope.ServiceProvider.GetRequiredService<IImageOptimizer>();

    int processed = 0, optimized = 0, skipped = 0, failed = 0;
    long savedBytes = 0;

    async Task OptimizeFile(string label, string filePath, string mimeType,
        Func<string, string, Task> updateDb)
    {
        processed++;
        try
        {
            var fullPath = storage.GetFullPath(filePath);
            if (!File.Exists(fullPath))
            {
                Console.WriteLine($"[MISSING] {filePath}");
                failed++;
                return;
            }

            var data = await File.ReadAllBytesAsync(fullPath);
            if (data.Length <= 200 * 1024)
            {
                Console.WriteLine($"[SKIP]      {filePath} ({data.Length / 1024}KB)");
                skipped++;
                return;
            }

            var result = await optimizer.OptimizeAsync(data, mimeType);

            if (!dryRun)
            {
                // Save new file
                var dir = Path.GetDirectoryName(filePath)!;
                var newFileName = Path.GetFileNameWithoutExtension(filePath) + result.Extension;
                var newRelPath = Path.Combine(dir, newFileName).Replace('\\', '/');

                var newFullPath = storage.GetFullPath(newRelPath);
                var newDir = Path.GetDirectoryName(newFullPath);
                if (newDir != null && !Directory.Exists(newDir))
                    Directory.CreateDirectory(newDir);

                await File.WriteAllBytesAsync(newFullPath, result.Data);
                await updateDb(newRelPath, result.MimeType);

                // Delete old file if path changed
                if (newRelPath != filePath && File.Exists(fullPath))
                    File.Delete(fullPath);
            }

            savedBytes += data.Length - result.Data.Length;
            Console.WriteLine($"[OPTIMIZED] {filePath} {data.Length / 1024}KB → {Path.GetFileNameWithoutExtension(filePath)}{result.Extension} {result.Data.Length / 1024}KB");
            optimized++;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[FAILED]    {filePath} — {ex.Message}");
            failed++;
        }
    }

    // 1. Edition covers
    Console.WriteLine("=== Edition Covers ===");
    var editions = await db.Editions
        .Where(e => e.CoverPath != null)
        .ToListAsync();

    foreach (var edition in editions)
    {
        var mime = edition.CoverPath!.EndsWith(".png") ? "image/png" : "image/jpeg";
        await OptimizeFile("cover", edition.CoverPath!, mime, async (newPath, newMime) =>
        {
            edition.CoverPath = newPath;
            edition.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
        });
    }

    // 2. Inline images (BookAssets)
    Console.WriteLine("\n=== Inline Images ===");
    var assets = await db.BookAssets
        .Where(a => a.Kind == AssetKind.InlineImage)
        .ToListAsync();

    foreach (var asset in assets)
    {
        await OptimizeFile("asset", asset.StoragePath, asset.ContentType, async (newPath, newMime) =>
        {
            asset.StoragePath = newPath;
            asset.ContentType = newMime;
            asset.ByteSize = new FileInfo(storage.GetFullPath(newPath)).Length;
            await db.SaveChangesAsync(CancellationToken.None);
        });
    }

    // 3. Author photos
    Console.WriteLine("\n=== Author Photos ===");
    var authors = await db.Authors
        .Where(a => a.PhotoPath != null)
        .ToListAsync();

    foreach (var author in authors)
    {
        var mime = author.PhotoPath!.EndsWith(".png") ? "image/png" : "image/jpeg";
        await OptimizeFile("photo", author.PhotoPath!, mime, async (newPath, newMime) =>
        {
            author.PhotoPath = newPath;
            author.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
        });
    }

    Console.WriteLine($"\nSummary: processed={processed}, optimized={optimized}, skipped={skipped}, failed={failed}, saved={savedBytes / 1024}KB");
    return;
}

// CLI: create-admin command
if (args.Length > 0 && args[0] == "create-admin")
{
    if (args.Length < 3)
    {
        Console.WriteLine("Usage: dotnet run create-admin <email> <password> [role]");
        Console.WriteLine("Roles: Admin (default), Editor, Moderator");
        return;
    }

    var email = args[1];
    var password = args[2];
    var role = AdminRole.Admin;

    if (args.Length >= 4 && Enum.TryParse<AdminRole>(args[3], true, out var parsedRole))
        role = parsedRole;

    using var cliScope = app.Services.CreateScope();
    var adminAuthService = cliScope.ServiceProvider.GetRequiredService<AdminAuthService>();

    try
    {
        var admin = await adminAuthService.CreateAdminUserAsync(email, password, role, CancellationToken.None);
        Console.WriteLine($"Admin user created: {admin.Email} ({admin.Role})");
    }
    catch (InvalidOperationException ex)
    {
        Console.WriteLine($"Error: {ex.Message}");
    }

    return;
}

// CLI: reindex-search command
if (args.Length > 0 && args[0] == "reindex-search")
{
    using var cliScope = app.Services.CreateScope();
    var reindexService = cliScope.ServiceProvider.GetRequiredService<SearchReindexService>();

    Console.WriteLine("Starting search reindex...");
    var (editions, chapters) = await reindexService.ReindexAllAsync(CancellationToken.None);
    Console.WriteLine($"Done: {editions} editions, {chapters} chapters indexed");
    return;
}

// CLI: backfill-edition-embeddings — AI-054. Recomputes editions.embedding as the
// element-wise mean-pool (SQL AVG) of each edition's already-embedded chapter chunks.
// $0 — reuses existing chunk embeddings, makes NO OpenAI calls. Idempotent.
if (args.Length > 0 && args[0] == "backfill-edition-embeddings")
{
    using var cliScope = app.Services.CreateScope();
    var db = cliScope.ServiceProvider.GetRequiredService<AppDbContext>();
    var connection = db.Database.GetDbConnection();

    Console.WriteLine("Backfilling edition embeddings (mean-pool of chunk embeddings, $0 — no OpenAI calls)...");
    var updated = await Infrastructure.Rag.EditionEmbeddingUpdater.RecomputeAsync(
        connection, editionId: null, CancellationToken.None);
    Console.WriteLine($"Done: {updated} edition embedding(s) updated.");
    return;
}

app.Run();
