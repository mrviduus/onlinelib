namespace Domain.Enums;

/// <summary>
/// Lifecycle states for <c>SeoBackfillJob</c>.
/// Transitions:
///   Queued → Running → (NeedsReview | Success | Failed)
///   NeedsReview → Success (on approve) | Reverted (on reject)
///   Success → Reverted (revert anytime)
/// </summary>
public enum SeoJobStatus
{
    Queued = 0,
    Running = 1,
    NeedsReview = 2,
    Success = 3,
    Failed = 4,
    Reverted = 5
}
