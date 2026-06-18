namespace Domain.Enums;

/// <summary>
/// Lifecycle of a <see cref="Domain.Entities.ModelRegistration"/> for a feature.
/// <c>Primary</c> serves real traffic; <c>Shadow</c> runs fire-and-forget alongside
/// the primary for comparison; <c>Retired</c> is kept for audit only. Stored as a
/// string column (HasConversion&lt;string&gt;) so the values read in SQL.
/// </summary>
public enum ModelStatus
{
    Shadow = 0,
    Primary = 1,
    Retired = 2
}
