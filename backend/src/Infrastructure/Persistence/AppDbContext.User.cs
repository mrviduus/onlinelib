using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// User account configurations: end-user + admin user + refresh tokens +
/// password reset. UserLibrary lives here too (per-user "saved books" list).
/// </summary>
public partial class AppDbContext
{
    private static void ConfigureUser(ModelBuilder modelBuilder)
    {
        // User
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.GoogleSubject).IsUnique().HasFilter("google_subject IS NOT NULL");
            e.HasIndex(x => x.AppleSubject).IsUnique().HasFilter("apple_subject IS NOT NULL");
            e.Property(x => x.Email).HasMaxLength(255);
            e.Property(x => x.GoogleSubject).HasMaxLength(255);
            e.Property(x => x.AppleSubject).HasMaxLength(255);
            e.Property(x => x.PasswordHash).HasMaxLength(255);
            e.Property(x => x.Name).HasMaxLength(255);
            e.Property(x => x.NativeLanguage).HasMaxLength(16);
            e.Property(x => x.IsGuest).HasDefaultValue(false);
            e.HasIndex(x => new { x.IsGuest, x.LastActiveAt })
                .HasFilter("is_guest = true")
                .HasDatabaseName("ix_users_guest_cleanup");
        });

        // UserLibrary
        modelBuilder.Entity<UserLibrary>(e =>
        {
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => new { x.UserId, x.EditionId }).IsUnique();
            e.HasOne(x => x.User).WithMany(x => x.UserLibraries).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // AdminUser
        modelBuilder.Entity<AdminUser>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
        });

        // AdminRefreshToken
        modelBuilder.Entity<AdminRefreshToken>(e =>
        {
            e.HasIndex(x => x.AdminUserId);
            e.HasIndex(x => x.ExpiresAt);
            e.HasIndex(x => x.Token).IsUnique();
            e.HasOne(x => x.AdminUser).WithMany(x => x.RefreshTokens).HasForeignKey(x => x.AdminUserId).OnDelete(DeleteBehavior.Cascade);
        });

        // UserRefreshToken
        modelBuilder.Entity<UserRefreshToken>(e =>
        {
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.ExpiresAt);
            e.HasIndex(x => x.Token).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // PasswordResetToken
        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.Property(x => x.TokenHash).HasMaxLength(128);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
