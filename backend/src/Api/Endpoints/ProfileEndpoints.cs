using Api.Extensions;
using Application.Auth;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class ProfileEndpoints
{
    private static readonly string[] AllowedPhotoExtensions = [".jpg", ".jpeg", ".png"];
    private const long MaxPhotoSize = 2 * 1024 * 1024; // 2MB

    public static void MapProfileEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/profile").WithTags("Profile");

        group.MapPut("/", UpdateProfile).WithName("UpdateProfile");
        group.MapPost("/avatar", UploadAvatar).WithName("UploadAvatar").DisableAntiforgery();
        group.MapDelete("/avatar", DeleteAvatar).WithName("DeleteAvatar");
    }

    private static async Task<IResult> UpdateProfile(
        [FromBody] UpdateProfileRequest request,
        AuthService authService,
        IAppDbContext db,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var user = await authService.GetUserByIdAsync(userId.Value, ct);
        if (user == null) return Results.Unauthorized();

        user.Name = request.Name?.Trim();
        await db.SaveChangesAsync(ct);

        return Results.Ok(new AuthResponse(new UserDto(user.Id, user.Email, user.Name, user.Picture, user.CreatedAt)));
    }

    private static async Task<IResult> UploadAvatar(
        IFormFile file,
        AuthService authService,
        IAppDbContext db,
        IFileStorageService storage,
        IImageOptimizer imageOptimizer,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var user = await authService.GetUserByIdAsync(userId.Value, ct);
        if (user == null) return Results.Unauthorized();

        if (file.Length == 0)
            return Results.BadRequest(new { error = "File is empty" });

        if (file.Length > MaxPhotoSize)
            return Results.BadRequest(new { error = "File too large. Max 2MB allowed" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedPhotoExtensions.Contains(ext))
            return Results.BadRequest(new { error = "Invalid file type. Only JPG and PNG allowed" });

        // Delete old avatar if it's a local file (not external URL like Google)
        if (!string.IsNullOrEmpty(user.Picture) && !user.Picture.StartsWith("http"))
        {
            await storage.DeleteFileAsync(user.Picture, ct);
        }

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var mimeType = file.ContentType ?? "image/jpeg";
        var optimized = await imageOptimizer.OptimizeAsync(ms.ToArray(), mimeType, ct: ct);

        using var optimizedStream = new MemoryStream(optimized.Data);
        var fileName = $"avatar{optimized.Extension}";
        var relativePath = await storage.SaveFileAsync(userId.Value, fileName, optimizedStream, ct);

        user.Picture = relativePath;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new AuthResponse(new UserDto(user.Id, user.Email, user.Name, user.Picture, user.CreatedAt)));
    }

    private static async Task<IResult> DeleteAvatar(
        AuthService authService,
        IAppDbContext db,
        IFileStorageService storage,
        HttpContext httpContext,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var user = await authService.GetUserByIdAsync(userId.Value, ct);
        if (user == null) return Results.Unauthorized();

        if (!string.IsNullOrEmpty(user.Picture) && !user.Picture.StartsWith("http"))
        {
            await storage.DeleteFileAsync(user.Picture, ct);
        }

        user.Picture = null;
        await db.SaveChangesAsync(ct);

        return Results.Ok();
    }
}

public record UpdateProfileRequest(string? Name);
