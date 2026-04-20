using Api.Sites;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminHighlightsEndpoints
{
    public static void MapAdminHighlightsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/highlights").WithTags("Admin Highlights");

        group.MapGet("/reports", GetReports).WithName("AdminGetHighlightReports");
        group.MapPost("/reports/{id:guid}/resolve", ResolveReport).WithName("AdminResolveHighlightReport");
        group.MapDelete("/{id:guid}", SoftDeleteHighlight).WithName("AdminDeleteHighlight");
    }

    private static async Task<IResult> GetReports(
        HttpContext ctx,
        IAppDbContext db,
        [FromQuery] string status = "open",
        [FromQuery] int limit = 50,
        [FromQuery] int offset = 0,
        CancellationToken ct = default)
    {
        var siteId = ctx.GetSiteId();
        limit = Math.Clamp(limit, 1, 200);

        var query = db.HighlightReports
            .Where(r => r.SiteId == siteId);

        if (status == "open")
            query = query.Where(r => r.ResolvedAt == null);
        else if (status == "resolved")
            query = query.Where(r => r.ResolvedAt != null);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip(offset)
            .Take(limit)
            .Select(r => new AdminHighlightReportDto(
                r.Id,
                r.HighlightId,
                r.Highlight.UserId,
                r.Highlight.SelectedText,
                r.Highlight.NoteText,
                r.Highlight.IsDeleted,
                r.Highlight.EditionId,
                r.Highlight.ChapterId,
                r.Highlight.Edition != null ? r.Highlight.Edition.Title : null,
                r.Highlight.Chapter != null ? r.Highlight.Chapter.Title : null,
                r.ReportedByUserId,
                r.Reason,
                r.Note,
                r.CreatedAt,
                r.ResolvedAt,
                r.Resolution
            ))
            .ToListAsync(ct);

        return Results.Ok(new { items, totalCount });
    }

    private static async Task<IResult> ResolveReport(
        Guid id,
        [FromBody] ResolveReportRequest request,
        HttpContext ctx,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = ctx.GetSiteId();
        var adminId = TryGetAdminUserId(ctx);

        var report = await db.HighlightReports
            .Where(r => r.Id == id && r.SiteId == siteId)
            .FirstOrDefaultAsync(ct);
        if (report == null) return Results.NotFound();
        if (report.ResolvedAt != null) return Results.BadRequest("Already resolved");

        if (request.Action != "dismiss" && request.Action != "delete")
            return Results.BadRequest("Invalid action");

        var now = DateTimeOffset.UtcNow;

        if (request.Action == "delete")
        {
            var highlight = await db.Highlights
                .Where(h => h.Id == report.HighlightId)
                .FirstOrDefaultAsync(ct);
            if (highlight != null && !highlight.IsDeleted)
            {
                highlight.IsDeleted = true;
                highlight.DeletedAt = now;
                highlight.DeletedByUserId = adminId == Guid.Empty ? null : adminId;
            }
        }

        report.ResolvedAt = now;
        report.ResolvedByAdminId = adminId == Guid.Empty ? null : adminId;
        report.Resolution = request.Action == "delete" ? "deleted" : "dismissed";

        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    private static async Task<IResult> SoftDeleteHighlight(
        Guid id,
        HttpContext ctx,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = ctx.GetSiteId();
        var adminId = TryGetAdminUserId(ctx);

        var highlight = await db.Highlights
            .Where(h => h.Id == id && h.SiteId == siteId)
            .FirstOrDefaultAsync(ct);
        if (highlight == null) return Results.NotFound();
        if (highlight.IsDeleted) return Results.NoContent();

        highlight.IsDeleted = true;
        highlight.DeletedAt = DateTimeOffset.UtcNow;
        highlight.DeletedByUserId = adminId == Guid.Empty ? null : adminId;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static Guid TryGetAdminUserId(HttpContext ctx)
    {
        var sub = ctx.User?.FindFirst("sub")?.Value ?? ctx.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out var id) ? id : Guid.Empty;
    }
}

public record AdminHighlightReportDto(
    Guid Id,
    Guid HighlightId,
    Guid HighlightUserId,
    string SelectedText,
    string? NoteText,
    bool HighlightIsDeleted,
    Guid? EditionId,
    Guid? ChapterId,
    string? EditionTitle,
    string? ChapterTitle,
    Guid ReportedByUserId,
    string Reason,
    string? Note,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ResolvedAt,
    string? Resolution
);

public record ResolveReportRequest(string Action);
