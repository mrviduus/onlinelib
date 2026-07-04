using Api.Extensions;
using Application.Auth;
using Application.ReadingTracking;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    private static async Task<IResult> GetBookStats(
        HttpContext httpContext,
        AuthService authService,
        ReadingStatsService statsService,
        [FromQuery] int? year,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var resp = await statsService.GetBookStatsAsync(userId.Value, year, ct);
        return Results.Ok(resp);
    }
}
