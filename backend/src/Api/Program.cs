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

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.AddAuthSettings(builder.Configuration);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is required");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString)
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

// Reindex service (used by CLI)
builder.Services.AddScoped<SearchReindexService>();

// Vocabulary SRS library
builder.Services.AddTextStackVocabulary(options =>
{
    options.OllamaBaseUrl = builder.Configuration["Ollama:BaseUrl"] ?? "http://localhost:11434";
    options.OllamaModel = builder.Configuration["Ollama:Model"] ?? "qwen3:8b";
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

// Standard Ebooks sync
builder.Services.AddHttpClient<StandardEbooksSyncService>();
builder.Services.AddScoped<StandardEbooksSyncService>();

// Email (Resend)
builder.Services.Configure<EmailSettings>(options =>
{
    options.ResendApiKey = builder.Configuration["Resend:ApiKey"] ?? "";
    options.FromEmail = builder.Configuration["Resend:FromEmail"] ?? "noreply@textstack.app";
    options.BaseUrl = builder.Configuration["App:BaseUrl"] ?? "https://textstack.app";
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
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
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
app.MapAdminSeoCrawlEndpoints();
app.MapAdminSsgRebuildEndpoints();
app.MapAdminCodeGenEndpoints();
app.MapAdminAutoPublishEndpoints();
app.MapAdminSeoBackfillEndpoints();
app.MapAdminLintEndpoints();
app.MapAdminSettingsEndpoints();
app.MapBooksEndpoints();
app.MapSearchEndpoints();
app.MapAuthorsEndpoints();
app.MapGenresEndpoints();
app.MapSiteEndpoints();
app.MapSeoEndpoints();
app.MapSsgEndpoints();
app.MapAuthEndpoints();
app.MapProfileEndpoints();
app.MapUserDataEndpoints();
app.MapHighlightsEndpoints();
app.MapTranslationEndpoints();
app.MapDictionaryEndpoints();
app.MapUserBooksEndpoints();
app.MapReadingTrackingEndpoints();
app.MapUserRatingEndpoints();
app.MapReviewEndpoints();
app.MapUserMoodEndpoints();
app.MapAdminMoodEndpoints();
app.MapAdminBoardTaskEndpoints();
app.MapAdminBookQualityEndpoints();
app.MapAdminBlogEndpoints();
app.MapBlogEndpoints();
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

app.Run();
