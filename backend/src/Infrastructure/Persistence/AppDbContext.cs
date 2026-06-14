using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Infrastructure.Persistence;

/// <summary>
/// Entity Framework DbContext for TextStack.
///
/// Schema configuration is split across partial files by domain to keep
/// each file under ~150 LOC and reviewable in isolation:
///
///   - AppDbContext.Catalog.cs       Site, Work, Edition, Chapter, BookFile, IngestionJob, Author, Genre, …
///   - AppDbContext.User.cs          User, UserLibrary, refresh tokens, password reset, admin user
///   - AppDbContext.Reading.cs       ReadingProgress, Bookmark, Note, Highlight, Session, Goal, Achievement
///   - AppDbContext.UserBooks.cs     UserBook, UserChapter, UserBookFile, UserIngestionJob, UserBookBookmark, BookQuality
///   - AppDbContext.Vocabulary.cs    VocabularyWord, Reviews, Settings, Pending, WordLookup/Frequency/Cluster
///   - AppDbContext.Ops.cs           AdminSettings, SsgRebuild, LintResult
///   - AppDbContext.Seo.cs           SeoTemplate, SeoBackfillJob/Settings, SeoSource defaults
///   - AppDbContext.Collections.cs   Collection, BookCollection
///
/// All splits use C# `partial class` — compile-identical to the original
/// monolithic file. Migrations are unaffected (model snapshot identical).
/// </summary>
public partial class AppDbContext : DbContext, IAppDbContext
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
    public DbSet<LlmTrace> LlmTraces => Set<LlmTrace>();
    public DbSet<EvalRun> EvalRuns => Set<EvalRun>();
    public DbSet<AgentRun> AgentRuns => Set<AgentRun>();
    public DbSet<PodcastGenerationJob> PodcastGenerationJobs => Set<PodcastGenerationJob>();

    // Phase 4 RAG. Intentionally not on IAppDbContext — retrieval uses raw Npgsql.
    public DbSet<ChapterChunk> ChapterChunks => Set<ChapterChunk>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Order doesn't matter — EF builds the model graph from all
        // configurations together before applying. We list by ownership
        // to make it easier to spot a missing call when adding entities.
        ConfigureCatalog(modelBuilder);
        ConfigureUser(modelBuilder);
        ConfigureReading(modelBuilder);
        ConfigureUserBooks(modelBuilder);
        ConfigureVocabulary(modelBuilder);
        ConfigureOps(modelBuilder);
        ConfigureSeo(modelBuilder);
        ConfigureCollections(modelBuilder);
        ConfigureAi(modelBuilder);
        ConfigureAgents(modelBuilder);
        ConfigurePodcasts(modelBuilder);
        ConfigureRag(modelBuilder);
    }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        base.OnConfiguring(optionsBuilder);
        optionsBuilder.UseSnakeCaseNamingConvention();
    }
}
