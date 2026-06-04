using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// AI observability entities. <see cref="LlmTrace"/> (table <c>llm_trace</c>) —
/// sampled per-call traces written by the AI TracingDecorator for
/// cost/latency/quality analysis. snake_case names come from the global
/// convention (OnConfiguring).
/// </summary>
public partial class AppDbContext
{
    private static void ConfigureAi(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<LlmTrace>(e =>
        {
            // Hot query: recent traces for a feature (admin dashboards).
            e.HasIndex(x => new { x.FeatureTag, x.CreatedAt });
            // Per-user lookups; partial index keeps it small (most traces have no user).
            e.HasIndex(x => x.UserId).HasFilter("user_id IS NOT NULL");

            e.Property(x => x.FeatureTag).HasMaxLength(64);
            e.Property(x => x.ModelId).HasMaxLength(128);
            e.Property(x => x.PromptHash).HasMaxLength(64);
            e.Property(x => x.MessagesJson).HasColumnType("jsonb");
            e.Property(x => x.ToolCallsJson).HasColumnType("jsonb");
            e.Property(x => x.CostUsd).HasColumnType("numeric(10,6)");

            // Optional FK → users; a deleted user nulls the column but keeps the trace.
            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
