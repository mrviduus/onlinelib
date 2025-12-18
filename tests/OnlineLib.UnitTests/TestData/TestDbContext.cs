using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace OnlineLib.UnitTests.TestData;

public class TestDbContext(DbContextOptions<TestDbContext> options) : DbContext(options), IAppDbContext
{
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<SiteDomain> SiteDomains => Set<SiteDomain>();
    public DbSet<Work> Works => Set<Work>();
    public DbSet<Edition> Editions => Set<Edition>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<BookFile> BookFiles => Set<BookFile>();
    public DbSet<IngestionJob> IngestionJobs => Set<IngestionJob>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserLibrary> UserLibraries => Set<UserLibrary>();
    public DbSet<ReadingProgress> ReadingProgresses => Set<ReadingProgress>();
    public DbSet<Bookmark> Bookmarks => Set<Bookmark>();
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<AdminRefreshToken> AdminRefreshTokens => Set<AdminRefreshToken>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Ignore SearchVector (postgres-specific)
        modelBuilder.Entity<Chapter>().Ignore(c => c.SearchVector);

        // Site
        modelBuilder.Entity<Site>().HasMany(s => s.Domains).WithOne(d => d.Site).HasForeignKey(d => d.SiteId);
        modelBuilder.Entity<Site>().HasMany(s => s.Works).WithOne(w => w.Site).HasForeignKey(w => w.SiteId);

        // Work
        modelBuilder.Entity<Work>().HasMany(w => w.Editions).WithOne(e => e.Work).HasForeignKey(e => e.WorkId);

        // Edition
        modelBuilder.Entity<Edition>().HasOne(e => e.Site).WithMany().HasForeignKey(e => e.SiteId);
        modelBuilder.Entity<Edition>().HasMany(e => e.Chapters).WithOne(c => c.Edition).HasForeignKey(c => c.EditionId);
        modelBuilder.Entity<Edition>().HasMany(e => e.BookFiles).WithOne(bf => bf.Edition).HasForeignKey(bf => bf.EditionId);
        modelBuilder.Entity<Edition>().HasMany(e => e.IngestionJobs).WithOne(j => j.Edition).HasForeignKey(j => j.EditionId);
        modelBuilder.Entity<Edition>().HasOne(e => e.SourceEdition).WithMany(e => e.TranslatedEditions).HasForeignKey(e => e.SourceEditionId);

        // BookFile
        modelBuilder.Entity<BookFile>().HasMany(bf => bf.IngestionJobs).WithOne(j => j.BookFile).HasForeignKey(j => j.BookFileId);

        // IngestionJob
        modelBuilder.Entity<IngestionJob>().HasOne(j => j.Work).WithMany().HasForeignKey(j => j.WorkId);
        modelBuilder.Entity<IngestionJob>().HasOne(j => j.SourceEdition).WithMany().HasForeignKey(j => j.SourceEditionId);

        // Chapter reading data
        modelBuilder.Entity<Chapter>().HasMany(c => c.ReadingProgresses).WithOne(rp => rp.Chapter).HasForeignKey(rp => rp.ChapterId);
        modelBuilder.Entity<Chapter>().HasMany(c => c.Bookmarks).WithOne(b => b.Chapter).HasForeignKey(b => b.ChapterId);
        modelBuilder.Entity<Chapter>().HasMany(c => c.Notes).WithOne(n => n.Chapter).HasForeignKey(n => n.ChapterId);

        // User
        modelBuilder.Entity<User>().HasMany(u => u.UserLibraries).WithOne(l => l.User).HasForeignKey(l => l.UserId);
        modelBuilder.Entity<User>().HasMany(u => u.ReadingProgresses).WithOne(rp => rp.User).HasForeignKey(rp => rp.UserId);
        modelBuilder.Entity<User>().HasMany(u => u.Bookmarks).WithOne(b => b.User).HasForeignKey(b => b.UserId);
        modelBuilder.Entity<User>().HasMany(u => u.Notes).WithOne(n => n.User).HasForeignKey(n => n.UserId);

        // Admin
        modelBuilder.Entity<AdminUser>().HasMany(a => a.RefreshTokens).WithOne(r => r.AdminUser).HasForeignKey(r => r.AdminUserId);
        modelBuilder.Entity<AdminUser>().HasMany(a => a.AuditLogs).WithOne(l => l.AdminUser).HasForeignKey(l => l.AdminUserId);
    }
}
