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
        if (!IsLocalRequest(ctx))
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
        if (!IsLocalRequest(ctx))
            return Results.StatusCode(403);

        var (success, error) = await adminService.PublishEditionAsync(id, ct);
        return success ? Results.Ok() : Results.BadRequest(new { error });
    }

    /// <summary>
    /// Allow loopback + Docker bridge (172.x) + Docker internal (10.x) networks.
    /// </summary>
    private static bool IsLocalRequest(HttpContext ctx)
    {
        var remote = ctx.Connection.RemoteIpAddress;
        if (remote == null) return true;
        if (IPAddress.IsLoopback(remote)) return true;

        // Docker bridge networks (172.16-31.x.x, 10.x.x.x)
        var bytes = remote.MapToIPv4().GetAddressBytes();
        if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
        if (bytes[0] == 10) return true;

        return false;
    }
}
