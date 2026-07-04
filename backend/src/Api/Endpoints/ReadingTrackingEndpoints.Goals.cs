using Api.Extensions;
using Api.Mapping;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static partial class ReadingTrackingEndpoints
{
    private static async Task<IResult> GetGoals(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var goals = await db.ReadingGoals
            .Where(g => g.UserId == userId.Value && g.IsActive)
            .Select(ReadingMappings.Project)
            .ToListAsync(ct);

        return Results.Ok(goals);
    }

    private static async Task<IResult> CreateOrUpdateGoal(
        [FromBody] CreateGoalRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (request.GoalType != "daily_minutes" && request.GoalType != "books_per_year")
            return Results.BadRequest("GoalType must be daily_minutes or books_per_year");
        if (request.TargetValue <= 0)
            return Results.BadRequest("TargetValue must be positive");

        var existing = await db.ReadingGoals
            .FirstOrDefaultAsync(g => g.UserId == userId.Value && g.GoalType == request.GoalType, ct);

        if (existing != null)
        {
            existing.TargetValue = request.TargetValue;
            existing.Year = request.Year;
            existing.IsActive = true;
            if (request.StreakMinMinutes.HasValue)
                existing.StreakMinMinutes = request.StreakMinMinutes.Value;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            existing = new ReadingGoal
            {
                Id = Guid.NewGuid(),
                UserId = userId.Value,
                SiteId = siteId,
                GoalType = request.GoalType,
                TargetValue = request.TargetValue,
                Year = request.Year,
                IsActive = true,
                StreakMinMinutes = request.StreakMinMinutes ?? 5,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.ReadingGoals.Add(existing);
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(existing.ToDto());
    }

    private static async Task<IResult> DeleteGoal(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var goal = await db.ReadingGoals
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId.Value, ct);
        if (goal == null) return Results.NotFound();

        db.ReadingGoals.Remove(goal);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
