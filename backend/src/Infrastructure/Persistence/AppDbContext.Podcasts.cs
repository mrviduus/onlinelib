using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>EF mapping for Phase 3 podcast generation (<see cref="PodcastGenerationJob"/>).</summary>
public partial class AppDbContext
{
    private static void ConfigurePodcasts(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PodcastGenerationJob>(e =>
        {
            e.HasIndex(x => x.Status);          // worker polls queued jobs
            e.HasIndex(x => x.EditionId);       // "latest podcast for this edition"
            e.Property(x => x.Lang).HasMaxLength(16);
            e.Property(x => x.ScriptJson).HasColumnType("jsonb");
            e.Property(x => x.CostUsd).HasColumnType("numeric(10,6)");

            e.HasOne(x => x.Edition)
                .WithMany()
                .HasForeignKey(x => x.EditionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
