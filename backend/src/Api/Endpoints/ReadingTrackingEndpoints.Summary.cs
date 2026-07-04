using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.ReadingTracking;
using Contracts.ReadingTracking;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    // --- Library Summary (slice 20) ---

    private static async Task<IResult> GetLibrarySummary(
        HttpContext httpContext,
        AuthService authService,
        ReadingStatsService statsService,
        IMemoryCache cache,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var cacheKey = $"library-summary:{userId.Value}:{siteId}:{tz ?? "0"}";
        if (cache.TryGetValue<LibrarySummaryDto>(cacheKey, out var cached) && cached != null)
            return Results.Ok(cached);

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;

        var dto = await statsService.GetLibrarySummaryAsync(userId.Value, tzOffset, now, ct);

        cache.Set(cacheKey, dto, TimeSpan.FromMinutes(5));
        return Results.Ok(dto);
    }

    // --- Reading Pace (slice 19) ---

    private static async Task<IResult> GetPace(
        HttpContext httpContext,
        AuthService authService,
        ReadingStatsService statsService,
        IMemoryCache cache,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var cacheKey = $"reading-pace:{userId.Value}:{siteId}";
        if (cache.TryGetValue<ReadingPaceDto>(cacheKey, out var cached) && cached != null)
            return Results.Ok(cached);

        var dto = await statsService.GetPaceAsync(userId.Value, ct);

        cache.Set(cacheKey, dto, TimeSpan.FromHours(1));
        return Results.Ok(dto);
    }
}
