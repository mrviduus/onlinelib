using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace Infrastructure.Persistence;

/// <summary>
/// Phase 4 RAG mapping. <see cref="ChapterChunk"/> (table <c>chapter_chunk</c>,
/// singular to match the playbook DDL + future raw retrieval SQL). The
/// <c>vector</c> column type comes from the pgvector extension, enabled here via
/// <c>HasPostgresExtension</c> so the migration emits CREATE EXTENSION before the
/// table. Embedding is stored as <c>float[]</c> on the entity and converted to
/// <see cref="Vector"/> for the database.
/// </summary>
public partial class AppDbContext
{
    private static void ConfigureRag(ModelBuilder modelBuilder)
    {
        // Emits `CREATE EXTENSION IF NOT EXISTS vector` ahead of the table.
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.Entity<ChapterChunk>(e =>
        {
            // Singular table name (matches playbook schema + hand-written retrieval SQL).
            e.ToTable("chapter_chunk");

            // float[] (framework-free Domain) <-> pgvector vector(1536). Nullable:
            // chunks are inserted before the batch embedder fills the vector.
            e.Property(x => x.Embedding)
                .HasColumnType("vector(1536)")
                .HasConversion(
                    v => v == null ? null : new Vector(v),
                    v => v == null ? null : v.ToArray());

            // RAG "S2": whole-chapter summary marker (defaults false for body chunks).
            e.Property(x => x.IsSummary).HasDefaultValue(false);

            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");

            // Approximate-NN index for cosine similarity search (AI-022+).
            e.HasIndex(x => x.Embedding)
                .HasMethod("hnsw")
                .HasOperators("vector_cosine_ops");

            // Ordered fetch of a chapter's chunks; covers the spoiler-gate edition scope.
            e.HasIndex(x => new { x.EditionId, x.ChapterId, x.Ord });

            // Overview-question path fetches ALL of an edition's summary rows (guaranteed-in-candidate-set
            // merge). Partial index over the handful of is_summary rows keeps that scan index-only.
            e.HasIndex(x => new { x.EditionId, x.ChapterOrd })
                .HasDatabaseName("ix_chapter_chunk_summary")
                .HasFilter("is_summary");

            e.HasOne(x => x.Edition)
                .WithMany()
                .HasForeignKey(x => x.EditionId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Chapter)
                .WithMany()
                .HasForeignKey(x => x.ChapterId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Phase 2: user-uploaded book chunks (table `user_chapter_chunk`). Isolated from
        // `chapter_chunk` (NOT polymorphic) and carries a denormalized user_id so retrieval can
        // hard-filter per user. Deleting a user book cascades the chunks away; deleting a chapter
        // NULLs the (now optional) chapter link (ADR-012 S3 — vision-PDF chunks live at book level).
        modelBuilder.Entity<UserChapterChunk>(e =>
        {
            e.ToTable("user_chapter_chunk");

            e.Property(x => x.Embedding)
                .HasColumnType("vector(1536)")
                .HasConversion(
                    v => v == null ? null : new Vector(v),
                    v => v == null ? null : v.ToArray());

            // RAG "S2": whole-chapter summary marker (defaults false for body chunks).
            e.Property(x => x.IsSummary).HasDefaultValue(false);

            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");

            // Own HNSW index — cosine NN over the user chunks (independent of the catalog index).
            e.HasIndex(x => x.Embedding)
                .HasMethod("hnsw")
                .HasOperators("vector_cosine_ops");

            // Per-user isolation filter (user_id + user_book_id) is the hot path; index it.
            e.HasIndex(x => new { x.UserId, x.UserBookId });
            // Ordered fetch of a chapter's chunks.
            e.HasIndex(x => new { x.UserBookId, x.UserChapterId, x.Ord });

            // Overview-question path fetches ALL of a book's summary rows (guaranteed-in-candidate-set
            // merge), still per-user isolated. Partial index over the handful of is_summary rows.
            e.HasIndex(x => new { x.UserId, x.UserBookId, x.ChapterOrd })
                .HasDatabaseName("ix_user_chapter_chunk_summary")
                .HasFilter("is_summary");

            e.HasOne(x => x.UserBook)
                .WithMany()
                .HasForeignKey(x => x.UserBookId)
                .OnDelete(DeleteBehavior.Cascade);

            // Optional chapter link (ADR-012 S3): a vision-PDF chunk may not map to any chapter, so the
            // FK is nullable and deleting a chapter SETs it NULL rather than cascading the chunk away.
            e.HasOne(x => x.UserChapter)
                .WithMany()
                .HasForeignKey(x => x.UserChapterId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
