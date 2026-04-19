using Domain.Enums;

namespace Domain.Entities;

public class ReadingRoomMember
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public Guid UserId { get; set; }
    public ReadingRoomMemberRole Role { get; set; }
    public required string Color { get; set; }
    public bool ShowProgress { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset? LeftAt { get; set; }

    public Guid? CurrentChapterId { get; set; }
    public double? CurrentPercent { get; set; }

    public ReadingRoom Room { get; set; } = null!;
    public User User { get; set; } = null!;
    public Chapter? CurrentChapter { get; set; }
}
