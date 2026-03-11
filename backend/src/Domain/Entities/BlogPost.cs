using Domain.Enums;

namespace Domain.Entities;

public class BlogPost
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Content { get; set; } = "";
    public string? Excerpt { get; set; }
    public string? CoverImagePath { get; set; }
    public string Language { get; set; } = "en";
    public BlogPostStatus Status { get; set; }
    public string AuthorName { get; set; } = "";
    public string? Tags { get; set; }
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
    public int ViewCount { get; set; }
    public int LikeCount { get; set; }
    public int CommentCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Site Site { get; set; } = null!;
    public ICollection<BlogComment> Comments { get; set; } = [];
    public ICollection<BlogLike> Likes { get; set; } = [];
}
