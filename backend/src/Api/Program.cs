using Api.Endpoints;
using Api.Extensions;
using Api.Language;
using Api.Middleware;
using Api.Sites;
using Application;
using Application.AdminAuth;
using Application.Common.Interfaces;
using Application.Search;
using Application.TextStack;
using Domain.Enums;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Host-level configuration (Kestrel/multipart limits + OpenTelemetry).
builder.AddTextStackUploadLimits();
builder.AddTextStackObservability();

builder.Services.AddTextStackCors(builder.Configuration);
builder.Services.AddOpenApi();

// Application layer + AI platform (eval runners, agents, tools, crews).
builder.Services
    .AddApplication()
    .AddTextStackAiEvals()
    .AddTextStackAgents()
    .AddAuthSettings(builder.Configuration);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is required");

// storagePath is consumed again by the static-file middleware below.
var storagePath = builder.Configuration["Storage:RootPath"] ?? "/storage";

// Persistence, search, RAG, product services, workers, and rate-limiting.
builder.Services
    .AddTextStackPersistence(connectionString, builder.Configuration)
    .AddTextStackSearchStack(connectionString, builder.Configuration)
    .AddTextStackRag(connectionString)
    .AddTextStackContentServices(builder.Configuration)
    .AddTextStackHostedServices()
    .AddTextStackRateLimiting();

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
    // Idempotent: seed the model registry (current Primary routes) only if empty (AI-075).
    // Non-critical (the gateway routes by config today) — a seeding failure must NOT
    // abort startup, so it's guarded + logged rather than allowed to escape.
    try
    {
        await ModelRegistrySeeder.SeedAsync(db);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Model registry seeding failed; continuing startup (registry not yet authoritative)");
    }
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
app.MapAccountEndpoints();
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
app.MapBookIndexEndpoints();
app.MapUserBookAskEndpoints();
app.MapUserBookIndexEndpoints();
app.MapBookChatEndpoints();
app.MapStudyBuddyEndpoints();
app.MapLibrarianEndpoints();
app.MapTutorEndpoints();
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

// CLI: backfill-vocabulary-embeddings — AI-058. Embeds every vocabulary_words row whose
// embedding IS NULL (across ALL users), in batches, and writes the vectors back. Unlike
// backfill-edition-embeddings (which reuses existing chunk vectors → $0), this DOES call
// OpenAI and costs money — one embedding request per word.
if (args.Length > 0 && args[0] == "backfill-vocabulary-embeddings")
{
    const int batchSize = 100;

    Console.WriteLine("############################################################");
    Console.WriteLine("#  COST WARNING — this calls the OpenAI embeddings API.    #");
    Console.WriteLine("#  One embedding request is billed per word with a NULL    #");
    Console.WriteLine("#  embedding, across ALL users. Unlike the edition         #");
    Console.WriteLine("#  backfill, this is NOT free.                             #");
    Console.WriteLine("############################################################");

    using var cliScope = app.Services.CreateScope();
    var db = cliScope.ServiceProvider.GetRequiredService<AppDbContext>();
    var embedder = cliScope.ServiceProvider.GetRequiredService<global::TextStack.Ai.Core.IEmbeddingService>();

    var totalPending = await db.VocabularyWords.CountAsync(w => w.Embedding == null);
    Console.WriteLine($"Words pending embedding: {totalPending}");

    var embedded = 0;
    while (true)
    {
        var batch = await db.VocabularyWords
            .Where(w => w.Embedding == null)
            .OrderBy(w => w.Id)
            .Take(batchSize)
            .ToListAsync();
        if (batch.Count == 0)
            break;

        var texts = batch
            .Select(w => $"{w.Word}. {w.Definition} {w.Sentence}".Trim())
            .ToList();
        var vectors = await embedder.EmbedBatchAsync(texts, CancellationToken.None);
        for (var i = 0; i < batch.Count; i++)
            batch[i].Embedding = vectors[i];

        await db.SaveChangesAsync(CancellationToken.None);
        embedded += batch.Count;
        Console.WriteLine($"Embedded {embedded}/{totalPending}...");
    }

    Console.WriteLine($"Done: {embedded} vocabulary word embedding(s) written.");
    return;
}

// CLI: cluster-vocabulary [userId?] — AI-058. Rebuilds semantic concept clusters. With a
// userId, rebuilds that user (across all their sites' words for the resolved site is handled
// per-user inside the service via BuildAll when no id is given). $0 — reuses stored embeddings.
if (args.Length > 0 && args[0] == "cluster-vocabulary")
{
    using var cliScope = app.Services.CreateScope();
    var service = cliScope.ServiceProvider.GetRequiredService<Application.Vocabulary.ConceptClusteringService>();

    if (args.Length >= 2 && Guid.TryParse(args[1], out var userId))
    {
        var db = cliScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sites = await db.VocabularyWords
            .Where(w => w.UserId == userId && !w.IsRetired && w.Embedding != null)
            .Select(w => w.SiteId)
            .Distinct()
            .ToListAsync();

        Console.WriteLine($"Clustering vocabulary for user {userId} across {sites.Count} site(s)...");
        var created = 0;
        foreach (var siteId in sites)
            created += await service.BuildForUserAsync(userId, siteId, CancellationToken.None);
        Console.WriteLine($"Done: {created} concept cluster(s) created.");
    }
    else
    {
        Console.WriteLine("Clustering vocabulary for all eligible users...");
        var created = await service.BuildAllAsync(CancellationToken.None);
        Console.WriteLine($"Done: {created} concept cluster(s) created.");
    }

    return;
}

app.Run();
