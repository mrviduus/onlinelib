namespace Domain.Entities;

public class VocabularyWord
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    // Word data
    public required string Word { get; set; }
    public required string Language { get; set; }
    public string? Translation { get; set; }
    public string? Definition { get; set; }

    // Book context
    public Guid? EditionId { get; set; }
    public Guid? ChapterId { get; set; }
    public Guid? UserBookId { get; set; }
    public string? Sentence { get; set; }
    public string? BookTitle { get; set; }

    // LLM-generated distractors (JSON array: ["word1","word2",...])
    public string? Distractors { get; set; }

    // SRS fields
    public int Stage { get; set; }
    public double IntervalDays { get; set; }
    public int ConsecutiveCorrect { get; set; }
    public DateTimeOffset NextReviewAt { get; set; }
    public DateTimeOffset? LastReviewedAt { get; set; }

    // Stats
    public int TotalReviews { get; set; }
    public int CorrectReviews { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // Navigation
    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public Chapter? Chapter { get; set; }
    public UserBook? UserBook { get; set; }
    public ICollection<VocabularyReview> Reviews { get; set; } = [];
}
