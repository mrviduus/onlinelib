using Application.Ai;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.Ai.EvalSuite;

/// <summary>One golden's outcome — what the model actually called, for the admin UI.</summary>
public sealed record ToolCallCase(string Word, string? ExpectedTool, IReadOnlyList<string> ActualTools, bool Hit);

/// <summary>Result of a tool-call eval run (AI-033). DoD: accuracy ≥ 0.9 over the 30-case set.</summary>
public sealed record ToolCallEvalResult(double Accuracy, int N, IReadOnlyList<ToolCallCase> Cases);

/// <summary>
/// Runs the Phase 5 tool-call eval (AI-033): for each golden, issue the REAL Explain round-1 — the
/// production prompt (<see cref="ExplainPrompt"/> with tool guidance) + the registry's tool schemas —
/// and score the model's tool choice with the pure <see cref="ToolCallMetrics"/> (right tool, right
/// args, or correctly NO tool). Round 1 only: tools are never executed, so the eval needs no edition,
/// no user, and costs one nano call per case. Persists an <c>explain.toolcall</c>
/// <see cref="EvalRun"/> (score 0–1) so /ai-quality tracks it like every other feature.
/// </summary>
public sealed class ToolCallEvalRunner(ILogger<ToolCallEvalRunner> logger)
{
    private const string Feature = "explain.toolcall";
    private const int MaxOutputTokens = 500; // matches the Explain endpoint's round-1 budget

    /// <summary>The Explain tools, as a signed-in reader with a book in context gets them
    /// (lookup_dictionary was dropped from Explain after the first eval run — see AI-033).</summary>
    private static readonly string[] ExplainToolNames =
        ["get_chapter", "search_book", "get_user_highlights"];

    public async Task<ToolCallEvalResult> RunAsync(
        ILlmService llm,
        IToolRegistry registry,
        bool persist,
        IAppDbContext? db,
        string? gitSha,
        CancellationToken ct)
    {
        var goldens = ToolCallGoldenSet.Load();
        var tools = registry.SchemasFor(ExplainToolNames);
        var systemPrompt = ExplainPrompt.BuildSystemPrompt(genre: null, targetLang: "en", withTools: true);

        var cases = new List<ToolCallCase>();
        string? modelId = null;
        foreach (var g in goldens)
        {
            ct.ThrowIfCancellationRequested();
            var request = new LlmRequest(
                systemPrompt,
                [new LlmMessage("user", ExplainPrompt.BuildUserPrompt(g.Word, g.Sentence))],
                MaxOutputTokens, Tools: tools, FeatureTag: Feature);

            var response = await llm.CompleteAsync(request, ct);
            modelId ??= response.ModelId;

            var hit = ToolCallMetrics.IsHit(response.ToolCalls, g.ExpectedTool, g.ExpectedArgFragments);
            cases.Add(new ToolCallCase(
                g.Word, g.ExpectedTool, response.ToolCalls.Select(c => c.ToolName).ToList(), hit));
        }

        var accuracy = ToolCallMetrics.Accuracy(cases.Select(c => c.Hit).ToList());
        logger.LogInformation("Tool-call eval: accuracy={Accuracy:0.00} (N={N})", accuracy, cases.Count);

        if (persist && db is not null)
        {
            db.EvalRuns.Add(new EvalRun
            {
                Id = Guid.NewGuid(),
                Feature = Feature,
                ModelId = modelId ?? "unknown",
                JudgeModelId = "n/a", // deterministic comparison, no judge
                Score = Math.Round((decimal)accuracy, 3),
                N = cases.Count,
                BreakdownJson =
                    $"{{\"hits\":{cases.Count(c => c.Hit)},\"noToolCases\":{cases.Count(c => c.ExpectedTool is null)}}}",
                GitSha = gitSha,
                CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync(ct);
        }

        return new ToolCallEvalResult(accuracy, cases.Count, cases);
    }
}
