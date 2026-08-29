namespace Domain.Entities;

public class UserVocabularySettings : ISiteScoped
{
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    public int DailyNewCap { get; set; } = 15;
    public int WeeklyReviewBudget { get; set; } = 70;

    // Default OFF: every tapped word goes straight to SRS (+ underline), no
    // frequency gating. Users can opt back in via vocab settings.
    public bool FrequencyFilterEnabled { get; set; } = false;
    public bool ClusteringEnabled { get; set; } = true;
    public bool AutoRetireEnabled { get; set; } = true;

    // Speak the word when a review card appears. Default ON: the speaker button was always there
    // and always worked, but nothing said the word unasked — on a screen whose whole purpose is
    // learning it. Lives with the account rather than the device because it is a preference about
    // how you learn, and because the settings sheet a reader looks in is this one.
    public bool AutoSpeakCards { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
}
