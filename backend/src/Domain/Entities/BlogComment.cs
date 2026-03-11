namespace Domain.Entities;

public class BlogComment
{
    public Guid Id { get; set; }
    public Guid BlogPostId { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }
    public string Text { get; set; } = "";
    public Guid? ParentCommentId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public BlogPost BlogPost { get; set; } = null!;
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public BlogComment? ParentComment { get; set; }
    public ICollection<BlogComment> Replies { get; set; } = [];
}
