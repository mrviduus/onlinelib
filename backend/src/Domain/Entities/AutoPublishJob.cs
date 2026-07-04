using Domain.Enums;

namespace Domain.Entities;

public class AutoPublishJob : ISiteScoped
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public Guid EditionId { get; set; }

    public AutoPublishJobStatus Status { get; set; } = AutoPublishJobStatus.Queued;
    public bool GeneratedEditionSeo { get; set; }
    public bool GeneratedAuthorSeo { get; set; }
    public bool Priority { get; set; }

    public string? Error { get; set; }
    public string? LogOutput { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }

    public Site Site { get; set; } = null!;
    public Edition Edition { get; set; } = null!;
}
