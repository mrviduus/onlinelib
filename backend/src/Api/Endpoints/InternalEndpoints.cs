using System.Net;
using Application.Admin;
using Application.Common.Interfaces;
using Application.SsgRebuild;
using Contracts.Admin;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class InternalEndpoints
{
    public static void MapInternalEndpoints(this WebApplication app)
    {
        app.MapPost("/internal/ssg/rebuild-all", RebuildAll)
            .WithName("InternalSsgRebuildAll")
            .ExcludeFromDescription();

        app.MapPost("/internal/editions/{id:guid}/publish", PublishEdition)
            .WithName("InternalPublishEdition")
            .ExcludeFromDescription();
    }

    private static async Task<IResult> RebuildAll(
        HttpContext ctx,
        IAppDbContext db,
        ISsgJobService ssgService,
        CancellationToken ct)
    {
        // Localhost-only
        var remote = ctx.Connection.RemoteIpAddress;
        if (remote != null && !IPAddress.IsLoopback(remote))
            return Results.StatusCode(403);

        var site = await db.Sites.FirstOrDefaultAsync(ct);
        if (site is null)
            return Results.BadRequest(new { error = "No site found" });

        var job = await ssgService.EnqueueSsgRebuildAsync(
            new CreateSsgRebuildJobRequest(site.Id, "Full", Concurrency: 4),
            ct);

        return job is not null
            ? Results.Ok(new { jobId = job.Id, status = "queued" })
            : Results.Ok(new { status = "skipped", reason = "rebuild already in progress" });
    }

    private static async Task<IResult> PublishEdition(
        Guid id,
        HttpContext ctx,
        AdminService adminService,
        CancellationToken ct)
    {
        var remote = ctx.Connection.RemoteIpAddress;
        if (remote != null && !IPAddress.IsLoopback(remote))
            return Results.StatusCode(403);

        var (success, error) = await adminService.PublishEditionAsync(id, ct);
        return success ? Results.Ok() : Results.BadRequest(new { error });
    }
}
