using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class AdminBoardTaskEndpoints
{
    private const int MaxTasks = 200;

    public static void MapAdminBoardTaskEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/tasks").WithTags("Admin Tasks");

        group.MapGet("/", GetAll).WithName("AdminGetBoardTasks");
        group.MapPost("/", Create).WithName("AdminCreateBoardTask");
        group.MapPatch("/{id:guid}", Update).WithName("AdminUpdateBoardTask");
        group.MapDelete("/{id:guid}", Delete).WithName("AdminDeleteBoardTask");
        group.MapPut("/reorder", Reorder).WithName("AdminReorderBoardTasks");
    }

    private static async Task<Guid> ResolveSiteId(IAppDbContext db, CancellationToken ct)
    {
        var site = await db.Sites.FirstAsync(ct);
        return site.Id;
    }

    private static async Task<IResult> GetAll(
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = await ResolveSiteId(db, ct);

        var tasks = await db.BoardTasks
            .Where(t => t.SiteId == siteId)
            .OrderBy(t => t.Order)
            .Select(t => new BoardTaskDto(t.Id, t.Title, t.Status, t.Order, t.Source, t.CreatedAt, t.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(tasks);
    }

    private static async Task<IResult> Create(
        [FromBody] CreateBoardTaskRequest request,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = await ResolveSiteId(db, ct);

        var count = await db.BoardTasks.CountAsync(t => t.SiteId == siteId, ct);
        if (count >= MaxTasks) return Results.BadRequest($"Maximum {MaxTasks} tasks reached");

        var maxOrder = await db.BoardTasks
            .Where(t => t.SiteId == siteId && t.Status == "todo")
            .MaxAsync(t => (int?)t.Order, ct) ?? 0;

        var now = DateTimeOffset.UtcNow;
        var task = new BoardTask
        {
            Id = Guid.NewGuid(),
            SiteId = siteId,
            Title = request.Title.Trim(),
            Status = "todo",
            Order = maxOrder + 1,
            Source = request.Source ?? "manual",
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.BoardTasks.Add(task);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new BoardTaskDto(task.Id, task.Title, task.Status, task.Order, task.Source, task.CreatedAt, task.UpdatedAt));
    }

    private static async Task<IResult> Update(
        Guid id,
        [FromBody] UpdateBoardTaskRequest request,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = await ResolveSiteId(db, ct);
        var task = await db.BoardTasks.FirstOrDefaultAsync(t => t.Id == id && t.SiteId == siteId, ct);
        if (task == null) return Results.NotFound();

        task.Title = request.Title.Trim();
        task.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(new BoardTaskDto(task.Id, task.Title, task.Status, task.Order, task.Source, task.CreatedAt, task.UpdatedAt));
    }

    private static async Task<IResult> Delete(
        Guid id,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = await ResolveSiteId(db, ct);
        var task = await db.BoardTasks.FirstOrDefaultAsync(t => t.Id == id && t.SiteId == siteId, ct);
        if (task == null) return Results.NotFound();

        db.BoardTasks.Remove(task);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    private static async Task<IResult> Reorder(
        [FromBody] ReorderBoardTasksRequest request,
        IAppDbContext db,
        CancellationToken ct)
    {
        var siteId = await ResolveSiteId(db, ct);
        var ids = request.Items.Select(i => i.Id).ToList();

        var tasks = await db.BoardTasks
            .Where(t => t.SiteId == siteId && ids.Contains(t.Id))
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in request.Items)
        {
            var task = tasks.FirstOrDefault(t => t.Id == item.Id);
            if (task == null) continue;
            task.Status = item.Status;
            task.Order = item.Order;
            task.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok();
    }
}

public record BoardTaskDto(Guid Id, string Title, string Status, int Order, string Source, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public record CreateBoardTaskRequest(string Title, string? Source);
public record UpdateBoardTaskRequest(string Title);
public record ReorderBoardTasksRequest(List<ReorderBoardTaskItem> Items);
public record ReorderBoardTaskItem(Guid Id, string Status, int Order);
