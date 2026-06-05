namespace Domain.Entities;

/// <summary>
/// One persisted eval run for a single AI feature (table <c>eval_runs</c>). Written
/// by the opt-in eval suite (tests/TextStack.AiEvals) so the /ai-quality Evals tab
/// can show score history and flag regressions.
///
/// NOTE: goldens are file-based (ADR-AI-006), so there is no eval_dataset FK — runs
/// are keyed by the <see cref="Feature"/> string (e.g. "explain", "vocab.distractor").
/// <see cref="Score"/> is the mean overall on a 1–5 scale; <see cref="BreakdownJson"/>
/// holds the per-dimension means. Plain POCO; EF mapping in AppDbContext.Ai.cs.
/// </summary>
public class EvalRun
{
    public Guid Id { get; set; }
    public required string Feature { get; set; }
    public required string ModelId { get; set; }
    public required string JudgeModelId { get; set; }
    public decimal Score { get; set; }
    public int N { get; set; }
    public string? BreakdownJson { get; set; }
    public string? GitSha { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
