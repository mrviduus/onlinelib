using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// Catalog entity configurations: Site graph + Work/Edition/Chapter +
/// ingestion plumbing (BookFile, IngestionJob) + Author/Genre +
/// import provenance + extracted assets.
///
/// Split off from the monolithic AppDbContext.cs to keep each domain
/// reviewable in isolation. Logic is byte-identical to the pre-split
/// version — see ADR-006 / migration snapshot for invariants.
/// </summary>
public partial class AppDbContext
{
    private static void ConfigureCatalog(ModelBuilder modelBuilder)
    {
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

            // AI-054: mean-pool edition embedding. Same float[] <-> pgvector vector(1536)
            // conversion as ChapterChunk.Embedding (see AppDbContext.Rag.cs). Nullable —
            // editions with no embedded chunks stay NULL. HNSW cosine index for AI-055
            // similarity (vector_cosine_ops — the stored mean is raw, not L2-normalized).
            e.Property(x => x.Embedding)
                .HasColumnType("vector(1536)")
                .HasConversion(
                    v => v == null ? null : new Pgvector.Vector(v),
                    v => v == null ? null : v.ToArray());
            e.HasIndex(x => x.Embedding)
                .HasMethod("hnsw")
                .HasOperators("vector_cosine_ops");

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

        // TextStackImport — provenance link for imported books.
        modelBuilder.Entity<TextStackImport>(e =>
        {
            e.HasIndex(x => x.SiteId);
            e.HasIndex(x => x.EditionId);
            e.HasIndex(x => new { x.SiteId, x.Identifier }).IsUnique();
            e.Property(x => x.Identifier).HasMaxLength(500);
            e.HasOne(x => x.Site).WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Edition).WithMany().HasForeignKey(x => x.EditionId).OnDelete(DeleteBehavior.Cascade);
        });

        // BookAsset — extracted images/etc tied to an edition.
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
    }
}
