namespace Domain.Entities;

public class AdminRefreshToken
{
    public Guid Id { get; set; }
    public Guid AdminUserId { get; set; }
    public required string Token { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public AdminUser AdminUser { get; set; } = null!;
}
