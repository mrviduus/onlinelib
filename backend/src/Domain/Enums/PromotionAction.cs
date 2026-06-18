namespace Domain.Enums;

/// <summary>
/// Why a <see cref="Domain.Entities.ModelPromotion"/> row was written. <c>Promote</c> =
/// an admin made a Shadow model the new Primary; <c>Rollback</c> = reverting the most
/// recent promotion for a feature (the demoted Shadow becomes Primary again). Stored as
/// a string column (HasConversion&lt;string&gt;) so the values read in SQL.
/// </summary>
public enum PromotionAction
{
    Promote = 0,
    Rollback = 1
}
