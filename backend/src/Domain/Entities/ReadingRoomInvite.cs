namespace Domain.Entities;

public class ReadingRoomInvite
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public required string TokenHash { get; set; }
    public int? MaxUses { get; set; }
    public int UsesCount { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public ReadingRoom Room { get; set; } = null!;
    public User CreatedByUser { get; set; } = null!;
}
