using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Infrastructure.Persistence;

public class AppDbContext : DbContext, IAppDbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public Task<IDbContextTransaction> BeginTransactionAsync(CancellationToken ct = default)
        => Database.BeginTransactionAsync(ct);

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
    public DbSet<UserRefreshToken> UserRefreshTokens => Set<UserRefreshToken>();
    public DbSet<Author> Authors => Set<Author>();
    public DbSet<EditionAuthor> EditionAuthors => Set<EditionAuthor>();
    public DbSet<Genre> Genres => Set<Genre>();
    public DbSet<TextStackImport> TextStackImports => Set<TextStackImport>();
    public DbSet<SsgRebuildJob> SsgRebuildJobs => Set<SsgRebuildJob>();
    public DbSet<SsgRebuildResult> SsgRebuildResults => Set<SsgRebuildResult>();
    public DbSet<BookAsset> BookAssets => Set<BookAsset>();
    public DbSet<LintResult> LintResults => Set<LintResult>();
    public DbSet<UserBook> UserBooks => Set<UserBook>();
    public DbSet<UserChapter> UserChapters => Set<UserChapter>();
    public DbSet<UserBookFile> UserBookFiles => Set<UserBookFile>();
    public DbSet<UserIngestionJob> UserIngestionJobs => Set<UserIngestionJob>();
    public DbSet<UserBookBookmark> UserBookBookmarks => Set<UserBookBookmark>();
    public DbSet<AdminSettings> AdminSettings => Set<AdminSettings>();
    public DbSet<Highlight> Highlights => Set<Highlight>();
    public DbSet<ReadingSession> ReadingSessions => Set<ReadingSession>();
    public DbSet<ReadingGoal> ReadingGoals => Set<ReadingGoal>();
    public DbSet<UserAchievement> UserAchievements => Set<UserAchievement>();
    public DbSet<VocabularyWord> VocabularyWords => Set<VocabularyWord>();
    public DbSet<VocabularyReview> VocabularyReviews => Set<VocabularyReview>();
    public DbSet<UserVocabularySettings> UserVocabularySettings => Set<UserVocabularySettings>();
    public DbSet<PendingVocabularyWord> PendingVocabularyWords => Set<PendingVocabularyWord>();
    public DbSet<WordLookup> WordLookups => Set<WordLookup>();
    public DbSet<WordFrequency> WordFrequencies => Set<WordFrequency>();
    public DbSet<WordCluster> WordClusters => Set<WordCluster>();
    public DbSet<AutoPublishJob> AutoPublishJobs => Set<AutoPublishJob>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<BookQualityJob> BookQualityJobs => Set<BookQualityJob>();
    public DbSet<SeoTemplate> SeoTemplates => Set<SeoTemplate>();
    public DbSet<SeoBackfillJob> SeoBackfillJobs => Set<SeoBackfillJob>();
    public DbSet<SeoBackfillSettings> SeoBackfillSettings => Set<SeoBackfillSettings>();
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<BookCollection> BookCollections => Set<BookCollection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Site
        modelBuilder.Entity<Site>(e =>
        {
            e.HasIndex(x => x.Code).IsUnique();
            e.HasIndex(x => x.PrimaryDomain).IsUnique();
            e.Property(x => x.Code).HasMaxLength(50);
            e.Property(x => x.PrimaryDomain).HasMaxLength(255);
            e.Property(x => x.DefaultLanguage).HasMaxLength(10);
            e.Property(x => x.Theme).HasMaxLength(50);
            e.Property(x => x.FeaturesJson).HasColumnType("jsonb");
        });

        // SiteDomain
        modelBuilder.Entity<SiteDomain>(e =>
        {
            e.HasIndex(x => x.Domain).IsUnique();
            e.Property(x => x.Domain).HasMaxLength(255);
            e.HasOne(x => x.Site).WithMany(x => x.Domains).HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Cascade);
        });

        // Work
        modelBuilder.Entity<Work>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => new { x.SiteId, x.Slug }).IsUnique();
            e.HasOne(x => x.Site).WithMany(x => x.Works).HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // Edition
        modelBuilder.Entity<Edition>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => x.SourceEditionId);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => new { x.WorkId, x.Language }).IsUnique();
            e.HasIndex(x => new { x.SiteId, x.Language, x.Slug }).IsUnique();
            e.Property(x => x.Language).HasMaxLength(8);
            e.Property(x => x.TocJson).HasColumnType("jsonb");
            e.HasOne(x => x.Work).WithMany(x => x.Editions).HasForeignKey(x => x.WorkId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SourceEdition).WithMany(x => x.TranslatedEditions).HasForeignKey(x => x.SourceEditionId).OnDelete(DeleteBehavior.SetNull);
        });

        // Chapter
        modelBuilder.Entity<Chapter>(e =>
        {
            e.HasIndex(x => new { x.EditionId, x.ChapterNumber }).IsUnique();
            e.HasIndex(x => new { x.EditionId, x.Slug });
            e.HasIndex(x => x.SearchVector).HasMethod("GIN");
            e.Property(x => x.SearchVector).HasColumnType("tsvector");
            e.HasOne(x => x.Edition).WithMany(x => x.Chapters).HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // BookFile
        modelBuilder.Entity<BookFile>(e =>
        {
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.Sha256);
            e.HasOne(x => x.Edition).WithMany(x => x.BookFiles).HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // IngestionJob
        modelBuilder.Entity<IngestionJob>(e =>
        {
            e.HasIndex(x => x.BookFileId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.SourceEditionId);
            e.HasIndex(x => x.WorkId);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.CreatedAt);
            e.Property(x => x.TargetLanguage).HasMaxLength(8);
            e.Property(x => x.SourceFormat).HasMaxLength(20);
            e.Property(x => x.TextSource).HasMaxLength(20);
            e.Property(x => x.WarningsJson).HasColumnType("jsonb");
            e.HasOne(x => x.BookFile).WithMany(x => x.IngestionJobs).HasForeignKey(x => x.BookFileId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Edition).WithMany(x => x.IngestionJobs).HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.SourceEdition).WithMany().HasForeignKey(x => x.SourceEditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Work).WithMany().HasForeignKey(x => x.WorkId).OnDelete(DeleteBehavior.SetNull);
        });

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

        // ReadingProgress
        modelBuilder.Entity<ReadingProgress>(e =>
        {
            e.HasIndex(x => x.ChapterId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => new { x.UserId, x.SiteId, x.EditionId }).IsUnique();
            e.HasOne(x => x.User).WithMany(x => x.ReadingProgresses).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Chapter).WithMany(x => x.ReadingProgresses).HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // Bookmark
        modelBuilder.Entity<Bookmark>(e =>
        {
            e.HasIndex(x => x.ChapterId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => new { x.UserId, x.SiteId, x.EditionId });
            e.HasOne(x => x.User).WithMany(x => x.Bookmarks).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Chapter).WithMany(x => x.Bookmarks).HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // Note
        modelBuilder.Entity<Note>(e =>
        {
            e.HasIndex(x => x.ChapterId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => x.HighlightId);
            e.HasIndex(x => new { x.UserId, x.SiteId, x.EditionId });
            e.HasOne(x => x.User).WithMany(x => x.Notes).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Chapter).WithMany(x => x.Notes).HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Highlight).WithOne(x => x.Note).HasForeignKey<Note>(x => x.HighlightId).OnDelete(DeleteBehavior.SetNull);
        });

        // Highlight
        modelBuilder.Entity<Highlight>(e =>
        {
            e.HasIndex(x => x.ChapterId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => x.UserBookId);
            e.HasIndex(x => new { x.UserId, x.SiteId, x.EditionId }).HasFilter("edition_id IS NOT NULL");
            e.HasIndex(x => new { x.UserId, x.SiteId, x.UserBookId }).HasFilter("user_book_id IS NOT NULL");
            e.Property(x => x.AnchorJson).HasColumnType("jsonb");
            e.Property(x => x.Color).HasMaxLength(20);
            e.HasOne(x => x.User).WithMany(x => x.Highlights).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Chapter).WithMany().HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserChapter).WithMany().HasForeignKey(x => x.UserChapterId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
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

        // Author
        modelBuilder.Entity<Author>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => new { x.SiteId, x.Slug }).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(255);
            e.Property(x => x.Name).HasMaxLength(255);
            e.Property(x => x.ExternalLinksJson).HasColumnType("jsonb");
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // EditionAuthor (junction table with order + role)
        modelBuilder.Entity<EditionAuthor>(e =>
        {
            e.ToTable("edition_authors");
            e.HasKey(x => new { x.EditionId, x.AuthorId });
            e.HasIndex(x => x.AuthorId);
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(50);
            e.HasOne(x => x.Edition).WithMany(x => x.EditionAuthors).HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Author).WithMany(x => x.EditionAuthors).HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Cascade);
        });

        // Genre
        modelBuilder.Entity<Genre>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => new { x.SiteId, x.Slug }).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(100);
            e.Property(x => x.Name).HasMaxLength(100);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Editions).WithMany(x => x.Genres).UsingEntity("edition_genres");
        });

        // TextStackImport
        modelBuilder.Entity<TextStackImport>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => new { x.SiteId, x.Identifier }).IsUnique();
            e.Property(x => x.Identifier).HasMaxLength(500);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // BookAsset
        modelBuilder.Entity<BookAsset>(e =>
        {
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => new { x.EditionId, x.OriginalPath }).IsUnique();
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.OriginalPath).HasMaxLength(500);
            e.Property(x => x.StoragePath).HasMaxLength(500);
            e.Property(x => x.ContentType).HasMaxLength(100);
            e.HasOne(x => x.Edition).WithMany(x => x.Assets).HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // SsgRebuildJob
        modelBuilder.Entity<SsgRebuildJob>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.CreatedAt);
            e.Property(x => x.Mode).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.BookSlugsJson).HasColumnType("jsonb");
            e.Property(x => x.AuthorSlugsJson).HasColumnType("jsonb");
            e.Property(x => x.GenreSlugsJson).HasColumnType("jsonb");
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // SsgRebuildResult
        modelBuilder.Entity<SsgRebuildResult>(e =>
        {
            e.HasIndex(x => x.JobId);
            e.HasIndex(x => new { x.JobId, x.Route }).IsUnique();
            e.Property(x => x.Route).HasMaxLength(500);
            e.Property(x => x.RouteType).HasMaxLength(20);
            e.HasOne(x => x.Job).WithMany(x => x.Results).HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);
        });

        // LintResult
        modelBuilder.Entity<LintResult>(e =>
        {
            e.HasIndex(x => x.EditionId);
            e.Property(x => x.Severity).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Code).HasMaxLength(10);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // UserBook
        modelBuilder.Entity<UserBook>(e =>
        {
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => new { x.UserId, x.Slug }).IsUnique();
            e.Property(x => x.Title).HasMaxLength(500);
            e.Property(x => x.Slug).HasMaxLength(500);
            e.Property(x => x.Language).HasMaxLength(10);
            e.Property(x => x.Author).HasMaxLength(500);
            e.Property(x => x.CoverPath).HasMaxLength(500);
            e.Property(x => x.Genre).HasMaxLength(200);
            e.Property(x => x.TocJson).HasColumnType("jsonb");
            e.Property(x => x.TakedownReason).HasMaxLength(1000);
            e.Property(x => x.SeoSource).HasMaxLength(20).HasDefaultValue("auto");
            e.Property(x => x.MetadataHistoryJson).HasColumnType("jsonb");
            e.Property(x => x.Tags).HasColumnType("text[]").HasDefaultValueSql("ARRAY[]::text[]");
            e.HasIndex(x => x.Tags).HasMethod("gin");
            e.Property(x => x.SuggestedTags).HasColumnType("text[]").HasDefaultValueSql("ARRAY[]::text[]");
            e.HasOne(x => x.User).WithMany(x => x.UserBooks).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // Collection (slice 13)
        modelBuilder.Entity<Collection>(e =>
        {
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => new { x.UserId, x.SortOrder });
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Color).HasMaxLength(20).HasDefaultValue("default");
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // BookCollection (slice 13) — composite PK on (CollectionId, BookId, BookType)
        modelBuilder.Entity<BookCollection>(e =>
        {
            e.HasKey(x => new { x.CollectionId, x.BookId, x.BookType });
            e.HasIndex(x => x.BookId);
            e.Property(x => x.BookType).HasMaxLength(20).IsRequired();
            e.HasOne(x => x.Collection).WithMany(c => c.Books).HasForeignKey(x => x.CollectionId).OnDelete(DeleteBehavior.Cascade);
        });

        // UserChapter
        modelBuilder.Entity<UserChapter>(e =>
        {
            e.HasIndex(x => x.UserBookId);
            e.HasIndex(x => new { x.UserBookId, x.ChapterNumber }).IsUnique();
            e.HasIndex(x => new { x.UserBookId, x.Slug }).IsUnique();
            e.Property(x => x.Title).HasMaxLength(500);
            e.Property(x => x.Slug).HasMaxLength(255);
            e.HasOne(x => x.UserBook).WithMany(x => x.Chapters).HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.Cascade);
        });

        // UserBookFile
        modelBuilder.Entity<UserBookFile>(e =>
        {
            e.HasIndex(x => x.UserBookId);
            e.HasIndex(x => x.Sha256);
            e.Property(x => x.OriginalFileName).HasMaxLength(500);
            e.Property(x => x.StoragePath).HasMaxLength(500);
            e.Property(x => x.Sha256).HasMaxLength(64);
            e.HasOne(x => x.UserBook).WithMany(x => x.BookFiles).HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.Cascade);
        });

        // UserIngestionJob
        modelBuilder.Entity<UserIngestionJob>(e =>
        {
            e.HasIndex(x => x.UserBookId);
            e.HasIndex(x => x.UserBookFileId);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.CreatedAt);
            e.Property(x => x.SourceFormat).HasMaxLength(50);
            e.HasOne(x => x.UserBook).WithMany(x => x.IngestionJobs).HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.UserBookFile).WithMany().HasForeignKey(x => x.UserBookFileId).OnDelete(DeleteBehavior.Cascade);
        });

        // UserBookBookmark
        modelBuilder.Entity<UserBookBookmark>(e =>
        {
            e.ToTable("user_book_bookmarks");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserBookId);
            e.Property(x => x.Locator).HasMaxLength(1000);
            e.Property(x => x.Title).HasMaxLength(500);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Chapter).WithMany().HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Cascade);
        });

        // AdminSettings
        modelBuilder.Entity<AdminSettings>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(100);
            e.Property(x => x.Value).HasMaxLength(500);
        });

        // ReadingSession
        modelBuilder.Entity<ReadingSession>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.SiteId });
            e.HasIndex(x => new { x.UserId, x.StartedAt });
            e.HasIndex(x => new { x.UserId, x.EditionId, x.StartedAt }).IsUnique().HasFilter("edition_id IS NOT NULL");
            e.HasIndex(x => new { x.UserId, x.UserBookId, x.StartedAt }).IsUnique().HasFilter("user_book_id IS NOT NULL");
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.SetNull);
        });

        // ReadingGoal
        modelBuilder.Entity<ReadingGoal>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.SiteId });
            e.HasIndex(x => new { x.UserId, x.SiteId, x.GoalType }).IsUnique();
            e.Property(x => x.GoalType).HasMaxLength(50);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // UserAchievement
        modelBuilder.Entity<UserAchievement>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.SiteId });
            e.HasIndex(x => new { x.UserId, x.SiteId, x.AchievementCode }).IsUnique();
            e.Property(x => x.AchievementCode).HasMaxLength(50);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // VocabularyWord
        modelBuilder.Entity<VocabularyWord>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.SiteId });
            // Phase 1 anti-spiral: retired rows are excluded from queue — index on IsRetired
            // so the filtered scan is a tight prefix read, not a full index scan + filter.
            e.HasIndex(x => new { x.UserId, x.SiteId, x.IsRetired, x.NextReviewAt });
            e.HasIndex(x => new { x.UserId, x.SiteId, x.Word, x.Language }).IsUnique();
            e.HasIndex(x => x.EditionId);
            e.Property(x => x.Word).HasMaxLength(200);
            e.Property(x => x.Language).HasMaxLength(8);
            e.Property(x => x.Translation).HasMaxLength(500);
            e.Property(x => x.Definition).HasMaxLength(2000);
            e.Property(x => x.Sentence).HasMaxLength(1000);
            e.Property(x => x.BookTitle).HasMaxLength(500);
            e.Property(x => x.Hint).HasMaxLength(500);
            e.Property(x => x.Explanation).HasMaxLength(1000);
            e.Property(x => x.Source).HasMaxLength(40);
            e.Property(x => x.RetiredReason).HasMaxLength(60);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Chapter).WithMany().HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.SetNull);
        });

        // UserVocabularySettings — one row per (user, site)
        modelBuilder.Entity<UserVocabularySettings>(e =>
        {
            e.HasKey(x => new { x.UserId, x.SiteId });
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // VocabularyReview
        modelBuilder.Entity<VocabularyReview>(e =>
        {
            e.HasIndex(x => x.VocabularyWordId);
            e.HasIndex(x => new { x.UserId, x.SiteId, x.CreatedAt });
            e.Property(x => x.ReviewMode).HasMaxLength(30);
            e.HasOne(x => x.VocabularyWord).WithMany(x => x.Reviews).HasForeignKey(x => x.VocabularyWordId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        // PendingVocabularyWord (F2: over-cap buffer)
        modelBuilder.Entity<PendingVocabularyWord>(e =>
        {
            // Promotion-order read: top-N by Priority DESC per user.
            e.HasIndex(x => new { x.UserId, x.SiteId, x.Priority }).IsDescending(false, false, true);
            // Dedup + list view (newest first).
            e.HasIndex(x => new { x.UserId, x.SiteId, x.CreatedAt });
            // Guard against duplicate pending rows for the same word.
            e.HasIndex(x => new { x.UserId, x.SiteId, x.Word, x.Language }).IsUnique();
            e.Property(x => x.Word).HasMaxLength(200);
            e.Property(x => x.Language).HasMaxLength(8);
            e.Property(x => x.Translation).HasMaxLength(500);
            e.Property(x => x.Definition).HasMaxLength(2000);
            e.Property(x => x.Sentence).HasMaxLength(1000);
            e.Property(x => x.BookTitle).HasMaxLength(500);
            e.Property(x => x.Source).HasMaxLength(40);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Chapter).WithMany().HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.SetNull);
        });

        // WordLookup (F1: rare-word reference bucket — taps that don't enter SRS)
        modelBuilder.Entity<WordLookup>(e =>
        {
            // Dedup: one row per (user, site, word, language). Tap increments TapCount.
            e.HasIndex(x => new { x.UserId, x.SiteId, x.Word, x.Language }).IsUnique();
            // List view (newest tapped first).
            e.HasIndex(x => new { x.UserId, x.SiteId, x.LastTappedAt }).IsDescending(false, false, true);
            e.Property(x => x.Word).HasMaxLength(200);
            e.Property(x => x.Language).HasMaxLength(8);
            e.Property(x => x.Sentence).HasMaxLength(1000);
            e.Property(x => x.BookTitle).HasMaxLength(500);
            e.Property(x => x.LastTranslation).HasMaxLength(500);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Chapter).WithMany().HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.SetNull);
        });

        // WordFrequency (F1: reference data — seeded from wordfreq export at startup)
        modelBuilder.Entity<WordFrequency>(e =>
        {
            // Primary classify lookup: (language, word) unique.
            e.HasIndex(x => new { x.Language, x.Word }).IsUnique();
            // Rank-ordered scans (e.g., "top 5000 for language X").
            e.HasIndex(x => new { x.Language, x.Rank });
            e.Property(x => x.Language).HasMaxLength(8);
            e.Property(x => x.Word).HasMaxLength(200);
            e.Property(x => x.Pos).HasMaxLength(20);
        });

        // WordCluster (F3: LLM-grouped thematic bonus rounds)
        modelBuilder.Entity<WordCluster>(e =>
        {
            // List view — active (undismissed) clusters per user, newest first.
            e.HasIndex(x => new { x.UserId, x.SiteId, x.IsDismissed, x.CreatedAt }).IsDescending(false, false, false, true);
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Theme).HasMaxLength(100);
            e.Property(x => x.BookTitle).HasMaxLength(500);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Words).WithOne().HasForeignKey(x => x.ClusterId).OnDelete(DeleteBehavior.SetNull);
        });

        // PasswordResetToken
        modelBuilder.Entity<PasswordResetToken>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.Property(x => x.TokenHash).HasMaxLength(128);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BookQualityJob>(e =>
        {
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => x.UserBookId);
            e.Property(x => x.IssuesJson).HasColumnType("jsonb");
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.UserBook).WithMany().HasForeignKey(x => x.UserBookId).OnDelete(DeleteBehavior.Cascade);
        });

        // SeoTemplate — editable Claude prompts per entity_type × field_type × language, version-frozen.
        modelBuilder.Entity<SeoTemplate>(e =>
        {
            e.HasIndex(x => new { x.EntityType, x.FieldType, x.LanguageCode, x.IsActive });
            e.Property(x => x.LanguageCode).HasMaxLength(8);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(500);
            e.Property(x => x.Model).HasMaxLength(100);
            e.Property(x => x.PromptTemplate).HasColumnType("text");
            e.Property(x => x.OutputSchema).HasColumnType("jsonb");
        });

        // SeoBackfillJob — audit trail for every run, frozen template versions enable replay.
        modelBuilder.Entity<SeoBackfillJob>(e =>
        {
            e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.HasIndex(x => new { x.EntityType, x.EntityId });
            e.Property(x => x.TargetFields).HasColumnType("text[]");
            e.Property(x => x.TemplateIds).HasColumnType("uuid[]");
            e.Property(x => x.TemplateVersions).HasColumnType("integer[]");
            e.Property(x => x.TriggeredBy).HasMaxLength(200);
            e.Property(x => x.InputSnapshot).HasColumnType("jsonb");
            e.Property(x => x.RenderedPrompts).HasColumnType("jsonb");
            e.Property(x => x.RawOutputs).HasColumnType("jsonb");
            e.Property(x => x.GeneratedContent).HasColumnType("jsonb");
            e.Property(x => x.BeforeSnapshot).HasColumnType("jsonb");
            e.Property(x => x.AfterSnapshot).HasColumnType("jsonb");
        });

        // SeoBackfillSettings — singleton.
        modelBuilder.Entity<SeoBackfillSettings>(e =>
        {
            e.Property(x => x.LanguageFilter).HasColumnType("text[]");
            e.Property(x => x.EntityTypeFilter).HasColumnType("text[]");
        });

        // seo_source on SEO-bearing entities — default 'Manual' (0) preserves existing rows.
        modelBuilder.Entity<Author>().Property(x => x.SeoSource).HasDefaultValue(Domain.Enums.SeoSource.Manual);
        modelBuilder.Entity<Edition>().Property(x => x.SeoSource).HasDefaultValue(Domain.Enums.SeoSource.Manual);
        modelBuilder.Entity<Genre>().Property(x => x.SeoSource).HasDefaultValue(Domain.Enums.SeoSource.Manual);
    }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        base.OnConfiguring(optionsBuilder);
        optionsBuilder.UseSnakeCaseNamingConvention();
    }
}
