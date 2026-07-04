using Api.Extensions;
using Application.Auth;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    private static async Task<IResult> GetAchievements(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var unlocked = await db.UserAchievements
            .Where(a => a.UserId == userId.Value)
            .Select(a => new AchievementDto(a.AchievementCode, a.UnlockedAt))
            .ToListAsync(ct);

        return Results.Ok(unlocked);
    }
}
