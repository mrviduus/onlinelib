using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// AI observability entities. <see cref="LlmTrace"/> (table <c>llm_traces</c>) —
/// sampled per-call traces written by the AI TracingDecorator for
/// cost/latency/quality analysis. <see cref="EvalRun"/> (table <c>eval_runs</c>) —
/// persisted eval scores per feature for the /ai-quality Evals tab. snake_case
/// names come from the global convention (OnConfiguring).
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

        modelBuilder.Entity<ShadowRun>(e =>
        {
            // Hot query: recent shadow runs for a feature (comparison dashboards).
            e.HasIndex(x => new { x.FeatureTag, x.CreatedAt });
            // Per-user lookups; partial index keeps it small (mirrors llm_traces).
            e.HasIndex(x => x.UserId).HasFilter("user_id IS NOT NULL");

            e.Property(x => x.FeatureTag).HasMaxLength(64);
            e.Property(x => x.PrimaryModelId).HasMaxLength(128);
            e.Property(x => x.ShadowModelId).HasMaxLength(128);
            e.Property(x => x.PromptHash).HasMaxLength(64);
            e.Property(x => x.PrimaryCostUsd).HasColumnType("numeric(10,6)");
            e.Property(x => x.ShadowCostUsd).HasColumnType("numeric(10,6)");

            // Optional FK → users; a deleted user nulls the column but keeps the run.
            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ModelRegistration>(e =>
        {
            // Hot query: which models serve a feature, by status (gateway / seeder).
            e.HasIndex(x => new { x.FeatureTag, x.Status });

            // Natural key — makes the startup seeder race-safe across replicas: a
            // concurrent second insert violates this and is swallowed by the seeder
            // guard instead of duplicating the seed rows.
            e.HasIndex(x => new { x.FeatureTag, x.ProviderKey, x.ModelId }).IsUnique();

            e.Property(x => x.ProviderKey).HasMaxLength(64);
            e.Property(x => x.ModelId).HasMaxLength(128);
            e.Property(x => x.FeatureTag).HasMaxLength(64);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        });

        modelBuilder.Entity<EvalRun>(e =>
        {
            // Hot query: recent runs for a feature (Evals tab history + regression).
            e.HasIndex(x => new { x.Feature, x.CreatedAt });
            e.Property(x => x.Feature).HasMaxLength(64);
            e.Property(x => x.ModelId).HasMaxLength(128);
            e.Property(x => x.JudgeModelId).HasMaxLength(128);
            e.Property(x => x.GitSha).HasMaxLength(64);
            e.Property(x => x.Score).HasColumnType("numeric(6,3)");
            e.Property(x => x.BreakdownJson).HasColumnType("jsonb");
        });
    }
}
