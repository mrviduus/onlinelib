using Api.Extensions;
using Application.Auth;
using Application.ReadingTracking;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    private static async Task<IResult> GetStats(
        HttpContext httpContext,
        AuthService authService,
        ReadingStatsService statsService,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;

        var resp = await statsService.GetStatsAsync(userId.Value, tzOffset, now, ct);
        return Results.Ok(resp);
    }

    private static async Task<IResult> GetDailyStats(
        HttpContext httpContext,
        AuthService authService,
        ReadingStatsService statsService,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;
        var start = from ?? now.AddDays(-90);
        var end = to ?? now;

        var daily = await statsService.GetDailyStatsAsync(userId.Value, start, end, tzOffset, ct);
        return Results.Ok(daily);
    }
}
