namespace Domain.Entities;

public class WordCluster
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    public required string Title { get; set; }
    public string? Theme { get; set; }

    public Guid? EditionId { get; set; }
    public Guid? UserBookId { get; set; }
    public string? BookTitle { get; set; }

    public int MemberCount { get; set; }
    public double CohesionScore { get; set; }

    public bool IsConfirmed { get; set; }
    public bool IsDismissed { get; set; }
    public DateTimeOffset? DismissedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public UserBook? UserBook { get; set; }
    public ICollection<VocabularyWord> Words { get; set; } = [];
}
