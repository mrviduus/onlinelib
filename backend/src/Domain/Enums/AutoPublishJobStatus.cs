namespace Domain.Enums;

public enum AutoPublishJobStatus
{
    Queued = 0,
    Running = 1,
    GeneratingSeo = 2,
    AwaitingReview = 3,
    Publishing = 4,
    Completed = 5,
    Failed = 6,
    Cancelled = 7
}
