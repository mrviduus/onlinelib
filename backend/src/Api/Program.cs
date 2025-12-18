using Api.Endpoints;
using Api.Sites;
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
        policy.WithOrigins("http://localhost:5173", "http://localhost:5174")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddOpenApi();

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5432;Database=books;Username=app;Password=changeme";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString)
        .UseSnakeCaseNamingConvention()
        .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));

// File storage
var storagePath = builder.Configuration["Storage:RootPath"] ?? "/storage";
builder.Services.AddSingleton<IFileStorageService>(new LocalFileStorageService(storagePath));

// Site resolution
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ISiteResolver, SiteResolver>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseCors();

// Health check before site resolution (for infra probes)
app.MapGet("/health", () => Results.Ok("healthy"));

// Site resolution middleware
app.UseSiteContext();

app.MapAdminEndpoints();
app.MapAdminSitesEndpoints();
app.MapBooksEndpoints();
app.MapSearchEndpoints();
app.MapSiteEndpoints();
app.MapSeoEndpoints();

app.Run();
