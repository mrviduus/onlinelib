using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Api.Middleware;

public class GuestActivityMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        await next(context);

        // After the request, check if user is a guest and update LastActiveAt (debounced)
        var isGuest = context.User.FindFirst("is_guest")?.Value == "true";
        if (!isGuest) return;

        var userIdClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !Guid.TryParse(userIdClaim, out var userId)) return;

        try
        {
            var db = context.RequestServices.GetRequiredService<IAppDbContext>();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return;

            // Debounce: only update if last activity was >1 hour ago
            if (user.LastActiveAt.HasValue &&
                DateTimeOffset.UtcNow - user.LastActiveAt.Value < TimeSpan.FromHours(1))
                return;

            user.LastActiveAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch
        {
            // Non-critical — don't fail the request
        }
    }
}
