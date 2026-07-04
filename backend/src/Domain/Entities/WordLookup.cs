namespace Domain.Entities;

// Anti-spiral F1: rare/OOV words the user tapped that did NOT enter SRS.
// Kept so the reader can still show a translation + "Add anyway" CTA without
// flooding the review queue with words the user will likely never see again.
// Mid-tier words sit here until TapCount >= LOOKUP_PROMOTION_TAPS, at which
// point SaveWord auto-promotes into VocabularyWord.
public class WordLookup : ISiteScoped
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    public required string Word { get; set; }
    public required string Language { get; set; }

    // null = OOV / PROPN / not in frequency dataset. Kept so a later dataset
    // refresh can re-classify without re-tapping.
    public int? ZipfRank { get; set; }

    public int TapCount { get; set; }

    // Last-seen context — overwritten on each tap, not history.
    public string? Sentence { get; set; }
    public string? BookTitle { get; set; }
    public Guid? EditionId { get; set; }
    public Guid? ChapterId { get; set; }
    public Guid? UserBookId { get; set; }
    public string? LastTranslation { get; set; }

    public DateTimeOffset FirstTappedAt { get; set; }
    public DateTimeOffset LastTappedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public Chapter? Chapter { get; set; }
    public UserBook? UserBook { get; set; }
}
