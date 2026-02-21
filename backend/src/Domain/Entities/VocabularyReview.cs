namespace Domain.Entities;

public class VocabularyReview
{
    public Guid Id { get; set; }
    public Guid VocabularyWordId { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    public required string ReviewMode { get; set; }
    public bool IsCorrect { get; set; }
    public int ResponseTimeMs { get; set; }
    public int StageBefore { get; set; }
    public int StageAfter { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    // Navigation
    public VocabularyWord VocabularyWord { get; set; } = null!;
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
