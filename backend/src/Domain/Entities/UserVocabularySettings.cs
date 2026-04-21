namespace Domain.Entities;

public class UserVocabularySettings
{
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    public int DailyNewCap { get; set; } = 15;
    public int WeeklyReviewBudget { get; set; } = 70;

    public bool FrequencyFilterEnabled { get; set; } = true;
    public bool ClusteringEnabled { get; set; } = true;
    public bool AutoRetireEnabled { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
