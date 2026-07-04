using Application.AdminAuth;
using Domain.Entities;

namespace Api.Mapping;

// R4: single source of truth for AdminUser -> AdminUserDto. In-memory only.
public static class AdminAuthMappings
{
    public static AdminUserDto ToDto(this AdminUser user) =>
        new(user.Id, user.Email, user.Role, user.CreatedAt);
}
