using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Rooms;
using Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class ReadingRoomsEndpoints
{
    public static void MapReadingRoomsEndpoints(this WebApplication app)
    {
        var me = app.MapGroup("/me/rooms").WithTags("Rooms");
        me.MapPost("", CreateRoom).RequireRateLimiting("room-create");
        me.MapGet("", ListMyRooms);
        me.MapDelete("/{roomId:guid}", CloseRoom);

        var rooms = app.MapGroup("/rooms").WithTags("Rooms");
        rooms.MapPost("/join", Join).RequireRateLimiting("room-join");
        rooms.MapGet("/{roomId:guid}", GetRoom);
        rooms.MapPost("/{roomId:guid}/leave", Leave);
        rooms.MapPost("/{roomId:guid}/invites", CreateInvite);
        rooms.MapPost("/{roomId:guid}/invites/{inviteId:guid}/revoke", RevokeInvite);
        rooms.MapGet("/{roomId:guid}/state", GetState).RequireRateLimiting("room-state");
        rooms.MapPost("/{roomId:guid}/heartbeat", Heartbeat).RequireRateLimiting("room-heartbeat");
    }

    // ----- /me/rooms -----

    private static async Task<IResult> CreateRoom(
        [FromBody] CreateRoomRequest req,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = ctx.GetSiteId();

        if (!Enum.TryParse<ReadingRoomTargetType>(req.TargetType, true, out var targetType))
            return Results.BadRequest(new { error = "invalid target type" });

        var res = await service.CreateAsync(userId.Value, siteId, targetType, req.TargetId, req.Name, ct);
        return res.IsOk
            ? Results.Ok(res.Value)
            : MapError(res.Error);
    }

    private static async Task<IResult> ListMyRooms(
        [FromQuery] int? limit,
        [FromQuery] bool? active,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var items = await service.ListMineAsync(userId.Value, limit ?? 20, active ?? true, ct);
        return Results.Ok(items);
    }

    private static async Task<IResult> CloseRoom(
        Guid roomId,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var err = await service.CloseAsync(userId.Value, roomId, ct);
        return err == RoomError.None ? Results.NoContent() : MapError(err);
    }

    // ----- /rooms -----

    private static async Task<IResult> Join(
        [FromBody] JoinRoomRequest req,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(req.Token))
            return Results.BadRequest(new { error = "token required" });

        var res = await service.JoinAsync(userId.Value, req.Token.Trim(), ct);
        return res.IsOk
            ? Results.Ok(new { roomId = res.Value })
            : MapError(res.Error);
    }

    private static async Task<IResult> GetRoom(
        Guid roomId,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var res = await service.GetAsync(userId.Value, roomId, ct);
        return res.IsOk ? Results.Ok(res.Value) : MapError(res.Error);
    }

    private static async Task<IResult> Leave(
        Guid roomId,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var err = await service.LeaveAsync(userId.Value, roomId, ct);
        return err == RoomError.None ? Results.NoContent() : MapError(err);
    }

    private static async Task<IResult> CreateInvite(
        Guid roomId,
        [FromBody] CreateInviteRequest? req,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        TimeSpan? ttl = req?.ExpiresInSeconds is int s and > 0 ? TimeSpan.FromSeconds(s) : null;

        var res = await service.CreateInviteAsync(userId.Value, roomId, ttl, req?.MaxUses, ct);
        return res.IsOk ? Results.Ok(res.Value) : MapError(res.Error);
    }

    private static async Task<IResult> RevokeInvite(
        Guid roomId,
        Guid inviteId,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var err = await service.RevokeInviteAsync(userId.Value, inviteId, ct);
        return err == RoomError.None ? Results.NoContent() : MapError(err);
    }

    private static async Task<IResult> GetState(
        Guid roomId,
        [FromQuery] DateTimeOffset? since,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var res = await service.GetStateAsync(userId.Value, roomId, since, ct);
        return res.IsOk ? Results.Ok(res.Value) : MapError(res.Error);
    }

    private static async Task<IResult> Heartbeat(
        Guid roomId,
        [FromBody] HeartbeatRequest req,
        HttpContext ctx,
        AuthService authService,
        RoomService service,
        CancellationToken ct)
    {
        var userId = ctx.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();

        var err = await service.HeartbeatAsync(
            userId.Value, roomId, req.ChapterId, req.Percent, req.ShowProgress, ct);
        return err == RoomError.None ? Results.NoContent() : MapError(err);
    }

    // ----- error mapping -----

    private static IResult MapError(RoomError e) => e switch
    {
        RoomError.NotFound => Results.NotFound(),
        RoomError.Forbidden => Results.Forbid(),
        RoomError.NotMember => Results.Forbid(),
        RoomError.AlreadyMember => Results.Conflict(new { error = "already_member" }),
        RoomError.RoomClosed => Results.StatusCode(StatusCodes.Status410Gone),
        RoomError.InviteInvalid => Results.BadRequest(new { error = "invite_invalid" }),
        RoomError.InviteExpired => Results.StatusCode(StatusCodes.Status410Gone),
        RoomError.InviteExhausted => Results.StatusCode(StatusCodes.Status410Gone),
        RoomError.InviteRevoked => Results.StatusCode(StatusCodes.Status410Gone),
        RoomError.MemberLimitReached => Results.Conflict(new { error = "member_limit_reached" }),
        RoomError.TargetUnsupported => Results.BadRequest(new { error = "target_unsupported" }),
        RoomError.TargetNotFound => Results.NotFound(new { error = "target_not_found" }),
        RoomError.InvalidInput => Results.BadRequest(new { error = "invalid_input" }),
        _ => Results.Problem("unknown error"),
    };
}

public record CreateRoomRequest(string TargetType, Guid TargetId, string? Name);
public record JoinRoomRequest(string Token);
public record CreateInviteRequest(int? ExpiresInSeconds, int? MaxUses);
public record HeartbeatRequest(Guid? ChapterId, double? Percent, bool? ShowProgress);
