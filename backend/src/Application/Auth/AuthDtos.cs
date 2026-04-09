namespace Application.Auth;

public record GoogleLoginRequest(string IdToken);

public record AppleLoginRequest(string IdentityToken, string? FullName, string? Email);

public record TestLoginRequest(string Email);

public record MobileRefreshRequest(string RefreshToken);

public record AuthResponse(UserDto User);

public record MobileAuthResponse(UserDto User, string AccessToken, string RefreshToken);

public record UserDto(Guid Id, string Email, string? Name, string? Picture, bool IsGuest, DateTimeOffset CreatedAt);

public record EmailRegisterRequest(string Email, string Password, string? Name);

public record EmailLoginRequest(string Email, string Password);

public record ForgotPasswordRequest(string Email);

public record ResetPasswordRequest(string Token, string Password);
