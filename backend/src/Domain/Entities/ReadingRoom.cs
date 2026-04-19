using Domain.Enums;

namespace Domain.Entities;

public class ReadingRoom
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public ReadingRoomTargetType TargetType { get; set; }
    public Guid TargetId { get; set; }
    public Guid OwnerUserId { get; set; }
    public string? Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public DateTimeOffset LastActivityAt { get; set; }

    public Site Site { get; set; } = null!;
    public User OwnerUser { get; set; } = null!;
    public ICollection<ReadingRoomMember> Members { get; set; } = [];
    public ICollection<ReadingRoomInvite> Invites { get; set; } = [];
}
