using Api.Extensions;
using Application.Auth;
using Application.Collections;
using Contracts.UserBooks;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class CollectionsEndpoints
{
    public static void MapCollectionsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/library/collections").WithTags("Collections");

        group.MapGet("", List).WithName("ListCollections");
        group.MapPost("", Create).WithName("CreateCollection");
        group.MapPut("/{id:guid}", Update).WithName("UpdateCollection");
        group.MapDelete("/{id:guid}", Delete).WithName("DeleteCollection");
        group.MapGet("/{id:guid}/books", GetBookIds).WithName("GetCollectionBooks");
        group.MapPost("/{id:guid}/books", AddBook).WithName("AddBookToCollection");
        group.MapDelete("/{id:guid}/books/{bookId:guid}", RemoveBook).WithName("RemoveBookFromCollection");
    }

    private static async Task<IResult> List(
        HttpContext ctx, AuthService auth, CollectionService svc, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var items = await svc.ListAsync(userId.Value, ct);
        return Results.Ok(items.Select(i => new CollectionDto(i.Id, i.Name, i.Color, i.SortOrder, i.Count)));
    }

    private static async Task<IResult> Create(
        HttpContext ctx, AuthService auth, CollectionService svc,
        [FromBody] CreateCollectionRequest req, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var (created, error) = await svc.CreateAsync(userId.Value, req.Name, req.Color, ct);
        if (error is not null) return Results.BadRequest(new { error });
        return Results.Ok(new CollectionDto(created!.Id, created.Name, created.Color, created.SortOrder, 0));
    }

    private static async Task<IResult> Update(
        HttpContext ctx, AuthService auth, CollectionService svc, Guid id,
        [FromBody] UpdateCollectionRequest req, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var (updated, error) = await svc.UpdateAsync(userId.Value, id, req.Name, req.Color, req.SortOrder, ct);
        if (error is not null) return error == "Collection not found" ? Results.NotFound() : Results.BadRequest(new { error });
        return Results.Ok(new CollectionDto(updated!.Id, updated.Name, updated.Color, updated.SortOrder, 0));
    }

    private static async Task<IResult> Delete(
        HttpContext ctx, AuthService auth, CollectionService svc, Guid id, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var ok = await svc.DeleteAsync(userId.Value, id, ct);
        return ok ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> GetBookIds(
        HttpContext ctx, AuthService auth, CollectionService svc, Guid id,
        [FromQuery] string bookType, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var ids = await svc.GetBookIdsAsync(userId.Value, id, bookType, ct);
        return Results.Ok(ids);
    }

    private static async Task<IResult> AddBook(
        HttpContext ctx, AuthService auth, CollectionService svc, Guid id,
        [FromBody] AddBookToCollectionRequest req, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var (ok, error) = await svc.AddBookAsync(userId.Value, id, req.BookId, req.BookType, ct);
        if (!ok) return error == "Collection not found" ? Results.NotFound() : Results.BadRequest(new { error });
        return Results.NoContent();
    }

    private static async Task<IResult> RemoveBook(
        HttpContext ctx, AuthService auth, CollectionService svc, Guid id, Guid bookId,
        [FromQuery] string bookType, CancellationToken ct)
    {
        var userId = ctx.GetUserId(auth);
        if (userId is null) return Results.Unauthorized();
        var ok = await svc.RemoveBookAsync(userId.Value, id, bookId, bookType, ct);
        return ok ? Results.NoContent() : Results.NotFound();
    }
}
