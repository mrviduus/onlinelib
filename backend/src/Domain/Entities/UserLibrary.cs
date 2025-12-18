namespace Domain.Entities;

public class UserLibrary
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid EditionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public Edition Edition { get; set; } = null!;
}
