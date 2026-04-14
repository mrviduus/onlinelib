using System.Text.Json;
using Application.Common.Interfaces;
using Application.Seo;
using Domain.Entities;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

/// <summary>
/// Admin panel endpoints for SEO backfill automation:
///   /admin/seo/templates    — CRUD + preview
///   /admin/seo/jobs         — list / approve / revert / retry
///   /admin/seo/coverage     — coverage stats
///   /admin/seo/gaps         — gap lookup + bulk queue
///   /admin/seo/queue        — single-entity queue
///   /admin/seo/settings     — singleton settings GET/PUT
/// </summary>
public static class AdminSeoBackfillEndpoints
{
    public static void MapAdminSeoBackfillEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/seo").WithTags("SEO Backfill");

        // Templates
        group.MapGet("/templates", ListTemplates);
        group.MapGet("/templates/{id:guid}", GetTemplate);
        group.MapPost("/templates", CreateTemplate);
        group.MapPut("/templates/{id:guid}", UpdateTemplate);
        group.MapDelete("/templates/{id:guid}", DeactivateTemplate);
        group.MapPost("/templates/{id:guid}/preview", PreviewTemplate);

        // Jobs
        group.MapGet("/jobs", ListJobs);
        group.MapGet("/jobs/{id:guid}", GetJob);
        group.MapPost("/jobs/{id:guid}/approve", ApproveJob);
        group.MapPost("/jobs/{id:guid}/revert", RevertJob);
        group.MapPost("/jobs/{id:guid}/retry", RetryJob);

        // Coverage + gaps
        group.MapGet("/coverage", GetCoverage);
        group.MapGet("/gaps", GetGaps);

        // Queue
        group.MapPost("/queue", QueueEntity);

        // Settings
        group.MapGet("/settings", GetSettings);
        group.MapPut("/settings", UpdateSettings);
    }

    // ── Templates ──

    private static async Task<IResult> ListTemplates(
        IAppDbContext db,
        [FromQuery] string? entityType,
        [FromQuery] string? fieldType,
        [FromQuery] string? language,
        [FromQuery] bool onlyActive = true,
        CancellationToken ct = default)
    {
        var q = db.SeoTemplates.AsNoTracking().AsQueryable();
        if (onlyActive) q = q.Where(t => t.IsActive);
        if (!string.IsNullOrWhiteSpace(entityType) && Enum.TryParse<SeoEntityType>(entityType, true, out var et))
            q = q.Where(t => t.EntityType == et);
        if (!string.IsNullOrWhiteSpace(fieldType) && Enum.TryParse<SeoFieldType>(fieldType, true, out var ft))
            q = q.Where(t => t.FieldType == ft);
        if (!string.IsNullOrWhiteSpace(language))
            q = q.Where(t => t.LanguageCode == language);

        var items = await q
            .OrderBy(t => t.EntityType).ThenBy(t => t.FieldType).ThenBy(t => t.LanguageCode)
            .Select(t => new
            {
                t.Id,
                EntityType = t.EntityType.ToString(),
                FieldType = t.FieldType.ToString(),
                t.LanguageCode,
                t.Name,
                t.Description,
                t.Model,
                t.MaxTokens,
                t.Temperature,
                TrustLevel = t.TrustLevel.ToString(),
                t.Version,
                t.IsActive,
                t.UpdatedAt
            })
            .ToListAsync(ct);
        return Results.Ok(items);
    }

    private static async Task<IResult> GetTemplate(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var t = await db.SeoTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        return t is null ? Results.NotFound() : Results.Ok(t);
    }

    public record UpsertTemplateRequest(
        string EntityType,
        string FieldType,
        string LanguageCode,
        string Name,
        string? Description,
        string PromptTemplate,
        string OutputSchema,
        string? Model,
        int? MaxTokens,
        double? Temperature,
        string? TrustLevel);

    private static async Task<IResult> CreateTemplate(
        [FromBody] UpsertTemplateRequest req, IAppDbContext db, CancellationToken ct)
    {
        if (!Enum.TryParse<SeoEntityType>(req.EntityType, true, out var et))
            return Results.BadRequest(new { error = "Unknown entityType" });
        if (!Enum.TryParse<SeoFieldType>(req.FieldType, true, out var ft))
            return Results.BadRequest(new { error = "Unknown fieldType" });
        // Validate schema is parseable
        try { using var _ = JsonDocument.Parse(req.OutputSchema); }
        catch (JsonException ex) { return Results.BadRequest(new { error = $"Invalid outputSchema JSON: {ex.Message}" }); }

        var trust = SeoTrustLevel.Review;
        if (!string.IsNullOrWhiteSpace(req.TrustLevel) && Enum.TryParse<SeoTrustLevel>(req.TrustLevel, true, out var parsed)) trust = parsed;

        var tpl = new SeoTemplate
        {
            Id = Guid.NewGuid(),
            EntityType = et,
            FieldType = ft,
            LanguageCode = req.LanguageCode.ToLowerInvariant(),
            Name = req.Name.Trim(),
            Description = req.Description?.Trim(),
            PromptTemplate = req.PromptTemplate,
            OutputSchema = req.OutputSchema,
            Model = string.IsNullOrWhiteSpace(req.Model) ? "claude-sonnet-4-6" : req.Model,
            MaxTokens = req.MaxTokens ?? 4096,
            Temperature = req.Temperature ?? 0.7,
            TrustLevel = trust,
            Version = 1,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        db.SeoTemplates.Add(tpl);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { tpl.Id, tpl.Version });
    }

    private static async Task<IResult> UpdateTemplate(
        Guid id, [FromBody] UpsertTemplateRequest req, IAppDbContext db, CancellationToken ct)
    {
        // "Edit" creates a new Version — old one deactivated.
        var current = await db.SeoTemplates.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (current is null) return Results.NotFound();

        try { using var _ = JsonDocument.Parse(req.OutputSchema); }
        catch (JsonException ex) { return Results.BadRequest(new { error = $"Invalid outputSchema JSON: {ex.Message}" }); }

        // Deactivate current + insert new active version.
        current.IsActive = false;
        current.UpdatedAt = DateTimeOffset.UtcNow;

        var trust = current.TrustLevel;
        if (!string.IsNullOrWhiteSpace(req.TrustLevel) && Enum.TryParse<SeoTrustLevel>(req.TrustLevel, true, out var parsed)) trust = parsed;

        var next = new SeoTemplate
        {
            Id = Guid.NewGuid(),
            EntityType = current.EntityType,
            FieldType = current.FieldType,
            LanguageCode = current.LanguageCode,
            Name = req.Name.Trim(),
            Description = req.Description?.Trim(),
            PromptTemplate = req.PromptTemplate,
            OutputSchema = req.OutputSchema,
            Model = string.IsNullOrWhiteSpace(req.Model) ? current.Model : req.Model,
            MaxTokens = req.MaxTokens ?? current.MaxTokens,
            Temperature = req.Temperature ?? current.Temperature,
            TrustLevel = trust,
            Version = current.Version + 1,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        db.SeoTemplates.Add(next);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { next.Id, next.Version });
    }

    private static async Task<IResult> DeactivateTemplate(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var t = await db.SeoTemplates.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Results.NotFound();
        t.IsActive = false;
        t.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    public record PreviewTemplateRequest(Guid EntityId);

    private static async Task<IResult> PreviewTemplate(
        Guid id,
        [FromBody] PreviewTemplateRequest req,
        IAppDbContext db,
        SeoContextBuilder contextBuilder,
        CancellationToken ct)
    {
        var tpl = await db.SeoTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (tpl is null) return Results.NotFound();

        var values = await contextBuilder.BuildAsync(tpl.EntityType, req.EntityId, ct);
        var rendered = SeoTemplateRenderer.Render(tpl.PromptTemplate, values);
        var missing = SeoTemplateRenderer.FindMissingPlaceholders(tpl.PromptTemplate, values);
        return Results.Ok(new { rendered, missingPlaceholders = missing, values });
    }

    // ── Jobs ──

    private static async Task<IResult> ListJobs(
        IAppDbContext db,
        [FromQuery] string? status,
        [FromQuery] string? entityType,
        [FromQuery] int offset = 0,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 200);
        offset = Math.Max(0, offset);

        var q = db.SeoBackfillJobs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<SeoJobStatus>(status, true, out var s))
            q = q.Where(j => j.Status == s);
        if (!string.IsNullOrWhiteSpace(entityType) && Enum.TryParse<SeoEntityType>(entityType, true, out var et))
            q = q.Where(j => j.EntityType == et);

        q = q.OrderByDescending(j => j.CreatedAt);
        var total = await q.CountAsync(ct);
        var items = await q.Skip(offset).Take(limit)
            .Select(j => new
            {
                j.Id,
                EntityType = j.EntityType.ToString(),
                j.EntityId,
                j.TargetFields,
                Status = j.Status.ToString(),
                j.Error,
                j.CreatedAt,
                j.StartedAt,
                j.CompletedAt,
                j.TriggeredBy,
                j.RequiresReview
            })
            .ToListAsync(ct);

        return Results.Ok(new { total, items });
    }

    private static async Task<IResult> GetJob(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var j = await db.SeoBackfillJobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (j is null) return Results.NotFound();
        return Results.Ok(new
        {
            j.Id,
            EntityType = j.EntityType.ToString(),
            j.EntityId,
            j.TargetFields,
            j.TemplateIds,
            j.TemplateVersions,
            Status = j.Status.ToString(),
            j.InputSnapshot,
            j.RenderedPrompts,
            j.RawOutputs,
            j.GeneratedContent,
            j.BeforeSnapshot,
            j.AfterSnapshot,
            j.Error,
            j.CreatedAt,
            j.StartedAt,
            j.CompletedAt,
            j.TriggeredBy,
            j.RequiresReview,
            j.ApprovedByUserId,
            j.ApprovedAt
        });
    }

    private static async Task<IResult> ApproveJob(
        Guid id,
        HttpContext ctx,
        SeoJobProcessor processor,
        CancellationToken ct)
    {
        var adminId = TryGetAdminUserId(ctx);
        try
        {
            await processor.ApproveAsync(id, adminId, ct);
            return Results.Ok();
        }
        catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
    }

    private static async Task<IResult> RevertJob(Guid id, SeoJobProcessor processor, CancellationToken ct)
    {
        try
        {
            await processor.RevertAsync(id, ct);
            return Results.Ok();
        }
        catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
    }

    private static async Task<IResult> RetryJob(Guid id, IAppDbContext db, CancellationToken ct)
    {
        var j = await db.SeoBackfillJobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (j is null) return Results.NotFound();
        if (j.Status is not (SeoJobStatus.Failed or SeoJobStatus.Reverted))
            return Results.BadRequest(new { error = $"Cannot retry job in status {j.Status}" });
        j.Status = SeoJobStatus.Queued;
        j.Error = null;
        j.StartedAt = null;
        j.CompletedAt = null;
        j.RawOutputs = null;
        j.GeneratedContent = null;
        j.AfterSnapshot = null;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    // ── Coverage ──

    private static async Task<IResult> GetCoverage(SeoCoverageAnalyzer analyzer, CancellationToken ct)
    {
        var stats = await analyzer.GetCoverageAsync(ct);
        return Results.Ok(stats);
    }

    private static async Task<IResult> GetGaps(
        SeoCoverageAnalyzer analyzer,
        [FromQuery] string entityType = "Edition",
        [FromQuery] string? language = null,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        var list = entityType.Equals("Author", StringComparison.OrdinalIgnoreCase)
            ? await analyzer.GetAuthorGapsAsync(language, limit, ct)
            : await analyzer.GetEditionGapsAsync(language, limit, ct);
        return Results.Ok(list);
    }

    // ── Queue ──

    public record QueueRequest(string EntityType, Guid EntityId, List<string> Fields, string Language = "en", bool RequireReview = true);

    private static async Task<IResult> QueueEntity(
        [FromBody] QueueRequest req,
        HttpContext ctx,
        SeoJobProcessor processor,
        CancellationToken ct)
    {
        if (!Enum.TryParse<SeoEntityType>(req.EntityType, true, out var et))
            return Results.BadRequest(new { error = "Unknown entityType" });
        var fields = new List<SeoFieldType>();
        foreach (var f in req.Fields)
        {
            if (!Enum.TryParse<SeoFieldType>(f, true, out var ft))
                return Results.BadRequest(new { error = $"Unknown field '{f}'" });
            fields.Add(ft);
        }
        if (fields.Count == 0) return Results.BadRequest(new { error = "Fields required" });

        var triggeredBy = ctx.User?.Identity?.Name ?? "admin:unknown";
        try
        {
            var id = await processor.EnqueueAsync(et, req.EntityId, fields, req.Language, req.RequireReview, triggeredBy, ct);
            return Results.Ok(new { jobId = id });
        }
        catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
    }

    // ── Settings ──

    private static async Task<IResult> GetSettings(IAppDbContext db, CancellationToken ct)
    {
        var s = await db.SeoBackfillSettings.FirstOrDefaultAsync(x => x.Id == SeoBackfillSettings.FixedId, ct);
        if (s is null) return Results.Ok(new { enabled = false, jobsPerRun = 5, intervalSeconds = 60 });
        return Results.Ok(new
        {
            s.Enabled,
            s.JobsPerRun,
            s.IntervalSeconds,
            s.LanguageFilter,
            s.EntityTypeFilter,
            s.SsgRebuildBatchMinutes
        });
    }

    public record UpdateSettingsRequest(
        bool? Enabled,
        int? JobsPerRun,
        int? IntervalSeconds,
        string[]? LanguageFilter,
        string[]? EntityTypeFilter,
        int? SsgRebuildBatchMinutes);

    private static async Task<IResult> UpdateSettings(
        [FromBody] UpdateSettingsRequest req, IAppDbContext db, CancellationToken ct)
    {
        var s = await db.SeoBackfillSettings.FirstOrDefaultAsync(x => x.Id == SeoBackfillSettings.FixedId, ct);
        if (s is null)
        {
            s = new SeoBackfillSettings { Id = SeoBackfillSettings.FixedId };
            db.SeoBackfillSettings.Add(s);
        }
        if (req.Enabled.HasValue) s.Enabled = req.Enabled.Value;
        if (req.JobsPerRun.HasValue) s.JobsPerRun = Math.Clamp(req.JobsPerRun.Value, 1, 50);
        if (req.IntervalSeconds.HasValue) s.IntervalSeconds = Math.Clamp(req.IntervalSeconds.Value, 10, 3600);
        if (req.LanguageFilter is not null) s.LanguageFilter = req.LanguageFilter;
        if (req.EntityTypeFilter is not null) s.EntityTypeFilter = req.EntityTypeFilter;
        if (req.SsgRebuildBatchMinutes.HasValue) s.SsgRebuildBatchMinutes = Math.Clamp(req.SsgRebuildBatchMinutes.Value, 1, 60);
        s.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    private static Guid TryGetAdminUserId(HttpContext ctx)
    {
        var sub = ctx.User?.FindFirst("sub")?.Value ?? ctx.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out var id) ? id : Guid.Empty;
    }
}
