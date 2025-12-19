using Api.Endpoints;
using Api.Middleware;
using Api.Sites;
using Application;
using Application.Common.Interfaces;
using Infrastructure.Data;
using Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "http://general.localhost",
                "http://programming.localhost",
                "http://admin.localhost"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddOpenApi();

// Application layer
builder.Services.AddApplication();

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5432;Database=books;Username=app;Password=changeme";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString)
        .UseSnakeCaseNamingConvention()
        .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));

builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

// File storage
var storagePath = builder.Configuration["Storage:RootPath"] ?? "/storage";
builder.Services.AddSingleton<IFileStorageService>(new LocalFileStorageService(storagePath));

// Site resolution
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ISiteResolver, SiteResolver>();

// Host-based site resolution
builder.Services.AddSingleton<HostSiteResolver>();
builder.Services.AddScoped<HostSiteContext>();
builder.Services.AddScoped<IHostSiteContext>(sp => sp.GetRequiredService<HostSiteContext>());

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

app.UseCors();
app.UseExceptionMiddleware();

// Health check before site resolution (for infra probes)
app.MapGet("/health", () => Results.Ok("healthy"));

// Site resolution middleware
app.UseHostSiteContext();
app.UseSiteContext();

app.MapDebugEndpoints(app.Environment);
app.MapAdminEndpoints();
app.MapAdminSitesEndpoints();
app.MapBooksEndpoints();
app.MapSearchEndpoints();
app.MapSiteEndpoints();
app.MapSeoEndpoints();

app.Run();
