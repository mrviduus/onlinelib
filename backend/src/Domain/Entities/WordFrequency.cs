namespace Domain.Entities;

// Reference data: Zipf-scale word frequencies from the `wordfreq` library.
// English-only for now (TextStack is English-learning-only). Loaded once at
// startup from a committed JSON.gz; no runtime writes. Used by FrequencyFilter
// to classify taps as SRS-eligible (top-5k), mid-tier (needs 2 taps), or
// lookup-only (>15k or POS=PROPN).
public class WordFrequency
{
    public Guid Id { get; set; }
    public required string Language { get; set; }
    public required string Word { get; set; }

    // 1 = most common. Aligns with wordfreq's rank semantics.
    public int Rank { get; set; }

    // wordfreq Zipf score: 1.0 (rarest) to ~8.0 (most common). Derived from
    // Rank in-source; stored to avoid recomputing on every tap.
    public double Zipf { get; set; }

    // Part-of-speech tag from spaCy (PROPN, NOUN, VERB, ...). Null = untagged
    // from dataset. PROPN is special-cased — never goes to SRS regardless of rank.
    public string? Pos { get; set; }
}
