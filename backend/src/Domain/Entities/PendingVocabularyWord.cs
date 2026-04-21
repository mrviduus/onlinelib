namespace Domain.Entities;

// Anti-spiral F2: over-cap saves land here instead of VocabularyWord. The
// reconciler promotes the highest-Priority pending rows once the day rolls
// over and the active queue has headroom. Shape mirrors VocabularyWord minus
// the SRS columns — SRS state is assigned at promotion time, not at save.
public class PendingVocabularyWord
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SiteId { get; set; }

    public required string Word { get; set; }
    public required string Language { get; set; }
    public string? Translation { get; set; }
    public string? Definition { get; set; }

    public Guid? EditionId { get; set; }
    public Guid? ChapterId { get; set; }
    public Guid? UserBookId { get; set; }
    public string? Sentence { get; set; }
    public string? BookTitle { get; set; }

    // Frequency-derived fields populated at save time so promotion doesn't
    // need to re-classify. `Priority` drives promotion order.
    public int? ZipfRank { get; set; }
    public double? ZipfScore { get; set; }
    public double Priority { get; set; }

    // Where the pending row came from. Copied onto VocabularyWord on promote.
    public string Source { get; set; } = "tap";

    public DateTimeOffset CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public Site Site { get; set; } = null!;
    public Edition? Edition { get; set; }
    public Chapter? Chapter { get; set; }
    public UserBook? UserBook { get; set; }
}
