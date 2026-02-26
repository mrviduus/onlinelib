namespace Domain.Entities;

public class ReviewComment
{
    public Guid Id { get; set; }
    public Guid UserRatingId { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public string Text { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public UserRating UserRating { get; set; } = null!;
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
