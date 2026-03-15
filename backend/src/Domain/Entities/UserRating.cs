namespace Domain.Entities;

public class UserRating
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public Guid? EditionId { get; set; }
    public Guid? UserBookId { get; set; }
    public double Rating { get; set; } // 0.5-5 (half-star increments)
    public string? ReviewText { get; set; }
    public string? Title { get; set; }
    public bool IsSpoiler { get; set; }
    public int HelpfulCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public UserBook? UserBook { get; set; }
    public ICollection<ReviewLike> Likes { get; set; } = [];
    public ICollection<ReviewComment> Comments { get; set; } = [];
}
