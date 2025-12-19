# Security

## Authentication

### Public Users
- Google Sign-In only
- No email/password
- JWT access token (10-20 min) + refresh token (30-90 days)
- Refresh tokens bound to device

### Admin Users
- Separate email/password auth
- Stored in `admin_users` table
- Password hashed (bcrypt or similar)
- Role-based access (Admin, Editor, Moderator)

## Authorization

| Route | Access |
|-------|--------|
| `/books/*` | Public |
| `/search` | Public |
| `/me/*` | Authenticated user |
| `/admin/*` | Admin role |

## Cookies

- Secure flag in production
- HttpOnly for tokens
- SameSite=Lax (CSRF mitigation)
- Short access token, long refresh token

## CSRF Protection

- SameSite cookies
- Double-submit cookie pattern (if needed)
- State mutations require auth

## CORS

Development:
- Allow localhost origins
- Credentials allowed

Production:
- Whitelist specific domains
- No wildcards

```csharp
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("https://fiction.example.com", "https://programming.example.com")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});
```

## Input Validation

- Validate file types on upload
- Size limits enforced
- SQL injection: use parameterized queries (EF Core)
- XSS: sanitize HTML in chapter content

## HTML Sanitization

Ingestion removes:
- `<script>` tags
- Event handlers (`onclick`, etc.)
- `javascript:` URLs
- Unknown/dangerous attributes

## Secrets Management

| Secret | Location |
|--------|----------|
| DB password | Environment variable |
| JWT signing key | Environment variable |
| Google OAuth | Environment variable |

Never commit secrets to repo. Use `.env` (gitignored).

## Rate Limiting

Planned for production:
- API: X requests per minute per IP
- Upload: size + count limits
- Search: query rate limit

## Logging

- Log auth failures
- Log admin actions (audit log)
- No sensitive data in logs
- Structured logging (Serilog)

## Checklist

- [ ] Secrets in env vars, not code
- [ ] HTTPS in production
- [ ] Secure cookie flags
- [ ] CORS whitelist
- [ ] Input validation
- [ ] HTML sanitization
- [ ] Rate limiting
- [ ] Audit logging
- [ ] Dependency updates

## See Also

- [ADR-002: Google Auth Only](../01-architecture/adr/002-google-auth-only.md)
- [Admin Panel: Authentication](../02-system/admin.md)
