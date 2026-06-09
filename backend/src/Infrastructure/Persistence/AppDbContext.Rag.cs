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

            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");

            // Approximate-NN index for cosine similarity search (AI-022+).
            e.HasIndex(x => x.Embedding)
                .HasMethod("hnsw")
                .HasOperators("vector_cosine_ops");

            // Ordered fetch of a chapter's chunks; covers the spoiler-gate edition scope.
            e.HasIndex(x => new { x.EditionId, x.ChapterId, x.Ord });

            e.HasOne(x => x.Edition)
                .WithMany()
                .HasForeignKey(x => x.EditionId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Chapter)
                .WithMany()
                .HasForeignKey(x => x.ChapterId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
