namespace Domain.Entities;

public class AdminAuditLog
{
    public Guid Id { get; set; }
    public Guid AdminUserId { get; set; }
    public required string ActionType { get; set; }
    public required string EntityType { get; set; }
    public Guid? EntityId { get; set; }
    public string? PayloadJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public AdminUser AdminUser { get; set; } = null!;
}
