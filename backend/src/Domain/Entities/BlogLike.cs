namespace Domain.Entities;

public class BlogLike
{
    public Guid Id { get; set; }
    public Guid BlogPostId { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public BlogPost BlogPost { get; set; } = null!;
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
