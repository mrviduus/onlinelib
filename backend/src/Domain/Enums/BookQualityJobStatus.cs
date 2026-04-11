namespace Domain.Enums;

public enum BookQualityJobStatus
{
    Queued = 0,
    Validating = 1,
    Fixing = 2,
    Completed = 3,
    Failed = 4,
    Cancelled = 5
}
