namespace Application.Auth;

public record GoogleLoginRequest(string IdToken);

public record AppleLoginRequest(string IdentityToken, string? FullName, string? Email);

public record TestLoginRequest(string Email);

public record MobileRefreshRequest(string RefreshToken);

/// <param name="GuestMergeSkipped">
/// Null on every ordinary sign-in. Non-null means the server decided NOT to carry pre-sign-in guest
/// data across and completed the sign-in anyway — see <c>AuthEndpoints.GuestMergeSkipReason</c> for
/// the values. Additive and optional: clients that ignore it behave exactly as before, but a client
/// that reads it can tell the user their offline work did not come with them instead of letting it
/// disappear without a word.
/// </param>
public record AuthResponse(UserDto User, string? GuestMergeSkipped = null);

/// <inheritdoc cref="AuthResponse"/>
public record MobileAuthResponse(
    UserDto User, string AccessToken, string RefreshToken, string? GuestMergeSkipped = null);

public record UserDto(Guid Id, string Email, string? Name, string? Picture, bool IsGuest, DateTimeOffset CreatedAt, string? NativeLanguage);

public record EmailRegisterRequest(string Email, string Password, string? Name);

public record EmailLoginRequest(string Email, string Password);

public record ForgotPasswordRequest(string Email);

public record ResetPasswordRequest(string Token, string Password);
