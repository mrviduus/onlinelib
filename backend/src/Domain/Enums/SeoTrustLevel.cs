namespace Domain.Enums;

/// <summary>
/// How much admin review a template's output needs before being applied to the entity.
/// Admin can upgrade trust after N successful jobs.
/// </summary>
public enum SeoTrustLevel
{
    /// <summary>Admin must manually apply every output. Job stays in NeedsReview until approved.</summary>
    Manual = 0,

    /// <summary>Output held in NeedsReview; admin approves or reverts.</summary>
    Review = 1,

    /// <summary>Output applied directly on success; admin can revert after the fact.</summary>
    Auto = 2
}
