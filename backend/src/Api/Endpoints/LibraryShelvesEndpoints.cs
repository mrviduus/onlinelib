using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Library;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class LibraryShelvesEndpoints
{
    public static void MapLibraryShelvesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/library").WithTags("User Library");

        group.MapGet("/shelves", GetShelves).WithName("GetLibraryShelves");
    }

    private static async Task<IResult> GetShelves(
        HttpContext httpContext,
        AuthService authService,
        LibraryShelvesService svc,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var siteId = httpContext.GetSiteId();
        var dto = await svc.GetShelvesAsync(userId.Value, siteId, ct);
        return Results.Ok(dto);
    }
}
