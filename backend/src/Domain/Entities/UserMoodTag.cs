namespace Domain.Entities;

public class UserMoodTag
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public Guid? EditionId { get; set; }
    public Guid? UserBookId { get; set; }
    public Guid MoodId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public UserBook? UserBook { get; set; }
    public Mood Mood { get; set; } = null!;
}
