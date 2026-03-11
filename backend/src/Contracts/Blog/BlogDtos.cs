namespace Contracts.Blog;

// Public DTOs

public record BlogPostListItemDto(
    Guid Id,
    string Slug,
    string Title,
    string? Excerpt,
    string? CoverImagePath,
    string AuthorName,
    string? Tags,
    string Language,
    int LikeCount,
    int CommentCount,
    int ViewCount,
    DateTimeOffset? PublishedAt
);

public record BlogPostDetailDto(
    Guid Id,
    string Slug,
    string Title,
    string Content,
    string? Excerpt,
    string? CoverImagePath,
    string AuthorName,
    string? Tags,
    string Language,
    string? SeoTitle,
    string? SeoDescription,
    int LikeCount,
    int CommentCount,
    int ViewCount,
    bool IsLikedByMe,
    DateTimeOffset? PublishedAt
);

public record BlogPostListResponse(
    int Total,
    IReadOnlyList<BlogPostListItemDto> Items
);

// Comment DTOs

public record BlogCommentDto(
    Guid Id,
    Guid UserId,
    string? UserName,
    string? UserPicture,
    string Text,
    Guid? ParentCommentId,
    IReadOnlyList<BlogCommentDto>? Replies,
    DateTimeOffset CreatedAt
);

public record BlogCommentListResponse(
    int Total,
    IReadOnlyList<BlogCommentDto> Items
);

public record AddBlogCommentRequest(
    string Text,
    Guid? ParentCommentId
);

// Like DTOs

public record BlogLikeResponse(
    bool Liked,
    int LikeCount
);

// Admin DTOs

public record AdminBlogPostListItemDto(
    Guid Id,
    string Slug,
    string Title,
    string AuthorName,
    string Language,
    string Status,
    int LikeCount,
    int CommentCount,
    int ViewCount,
    DateTimeOffset? PublishedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public record AdminBlogPostDetailDto(
    Guid Id,
    string Slug,
    string Title,
    string Content,
    string? Excerpt,
    string? CoverImagePath,
    string AuthorName,
    string? Tags,
    string Language,
    string Status,
    string? SeoTitle,
    string? SeoDescription,
    int LikeCount,
    int CommentCount,
    int ViewCount,
    DateTimeOffset? PublishedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public record AdminBlogPostListResponse(
    int Total,
    IReadOnlyList<AdminBlogPostListItemDto> Items
);

public record CreateBlogPostRequest(
    string Title,
    string Content,
    string Language,
    string AuthorName,
    string? Excerpt,
    string? Tags,
    string? SeoTitle,
    string? SeoDescription
);

public record UpdateBlogPostRequest(
    string Title,
    string Content,
    string Language,
    string AuthorName,
    string? Excerpt,
    string? Tags,
    string? SeoTitle,
    string? SeoDescription
);

public record AdminBlogStatsDto(
    int Total,
    int Published,
    int Draft,
    int TotalComments,
    int TotalLikes
);
