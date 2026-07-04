namespace Domain.Entities;

public class VocabularyWord : ISiteScoped
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

    // LLM-generated hint — describes the word without saying it
    public string? Hint { get; set; }

    // LLM-generated explanation — contextual explanation of the word for New Word intro card
    public string? Explanation { get; set; }

    // SRS fields
    public int Stage { get; set; }
    public double IntervalDays { get; set; }
    public int ConsecutiveCorrect { get; set; }
    public DateTimeOffset NextReviewAt { get; set; }
    public DateTimeOffset? LastReviewedAt { get; set; }

    // Stats
    public int TotalReviews { get; set; }
    public int CorrectReviews { get; set; }

    // Anti-spiral fields (Phase 1+)
    public int? ZipfRank { get; set; }
    public double? ZipfScore { get; set; }
    public double Priority { get; set; }
    public string Source { get; set; } = "tap";
    public DateTimeOffset? ActivatedAt { get; set; }
    public Guid? ClusterId { get; set; }

    // AI-058: semantic concept clustering — separate from the book-grouper's ClusterId.
    // OpenAI word embedding (pgvector vector(1536), float[] to keep Domain framework-free)
    // and the FK to the user's concept-group WordCluster (Kind="concept").
    public float[]? Embedding { get; set; }
    public Guid? ConceptClusterId { get; set; }
    public WordCluster? ConceptCluster { get; set; }

    public bool IsRetired { get; set; }
    public DateTimeOffset? RetiredAt { get; set; }
    public string? RetiredReason { get; set; }

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
