using Domain.Enums;

namespace Application.Rooms;

public enum RoomError
{
    None,
    NotFound,
    Forbidden,
    NotMember,
    RoomClosed,
    InviteInvalid,
    InviteExpired,
    InviteExhausted,
    InviteRevoked,
    MemberLimitReached,
    TargetUnsupported,
    TargetNotFound,
    InvalidInput
}

public record RoomResult<T>(T? Value, RoomError Error)
{
    public bool IsOk => Error == RoomError.None;
    public static RoomResult<T> Ok(T value) => new(value, RoomError.None);
    public static RoomResult<T> Fail(RoomError e) => new(default, e);
}

public record CreateRoomResult(Guid RoomId, string InviteToken, DateTimeOffset InviteExpiresAt);

public record RoomMemberView(
    Guid UserId,
    string? UserName,
    string? UserPicture,
    string Color,
    ReadingRoomMemberRole Role,
    bool ShowProgress,
    DateTimeOffset JoinedAt,
    DateTimeOffset LastSeenAt,
    Guid? CurrentChapterId,
    double? CurrentPercent);

public record RoomView(
    Guid Id,
    ReadingRoomTargetType TargetType,
    Guid TargetId,
    Guid? OwnerUserId,
    string? Name,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ClosedAt,
    List<RoomMemberView> Members,
    string? BookTitle,
    string? BookSlug,
    string? BookLanguage,
    string? BookCoverPath,
    string? FirstChapterSlug);

public record RoomSummary(
    Guid Id,
    ReadingRoomTargetType TargetType,
    Guid TargetId,
    string? Name,
    int MemberCount,
    DateTimeOffset LastActivityAt,
    bool IsOwner,
    string? BookTitle,
    string? BookSlug,
    string? BookLanguage,
    string? BookCoverPath,
    string? FirstChapterSlug);

public record SharedHighlightView(
    Guid Id,
    Guid UserId,
    string MemberColor,
    Guid? ChapterId,
    string AnchorJson,
    string Color,
    string SelectedText,
    string? NoteText,
    DateTimeOffset UpdatedAt);

public record RoomStateView(
    List<RoomMemberView> Members,
    List<SharedHighlightView> Highlights,
    List<Guid> HighlightDeletes,
    DateTimeOffset Cursor);

public record CreateInviteResult(Guid Id, string Token, DateTimeOffset ExpiresAt);
