namespace Application.Auth;

public interface IEmailService
{
    Task SendPasswordResetEmailAsync(string toEmail, string resetToken, CancellationToken ct);
}
