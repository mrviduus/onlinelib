using Application.Agents;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;

namespace Worker.Services;

/// <summary>
/// The agentic <see cref="IBookMetadataGenerator"/> (AI-Agent-1): runs the <see cref="EnrichmentAgent"/>
/// (tool-using, cross-checked, calibrated) instead of a single Ollama call, persists the run to
/// <c>agent_run</c> (with confidence + tool-call telemetry), and falls back to the legacy Ollama generator
/// on agent error or budget exhaustion. Kept fire-and-forget by its callers (the Worker), so a slow or
/// flaky enrichment never blocks ingestion. Decorates the legacy generator rather than replacing it, so
/// the catalog backfill / Ollama path is untouched.
/// </summary>
public sealed class EnrichmentAgentMetadataGenerator(
    BookMetadataGenerator fallback,
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<EnrichmentAgentMetadataGenerator> logger) : IBookMetadataGenerator
{
    private const double DefaultThreshold = 0.7;

    private double Threshold =>
        config.GetValue("Enrichment:ConfidenceThreshold", DefaultThreshold);

    /// <summary>Legacy entry point: no excerpt, no provenance — defer to the Ollama generator.</summary>
    public Task<BookMetadataResult?> GenerateAsync(string title, string? author, bool needsDescription, CancellationToken ct) =>
        fallback.GenerateAsync(title, author, needsDescription, ct);

    public async Task<BookMetadataResult?> EnrichAsync(
        Guid bookId, string title, string? author, string? excerpt, bool needsDescription, CancellationToken ct)
    {
        // Each agent run owns a DI scope: tools resolve IHttpClientFactory, the run writer a fresh DbContext.
        await using var scope = scopeFactory.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var agent = sp.GetRequiredService<EnrichmentAgent>();
        var runWriter = sp.GetRequiredService<IAgentRunWriter>();

        var runId = Guid.NewGuid();
        var input = new EnrichmentInput(title, author, excerpt, needsDescription);
        var ctx = new AgentContext(UserId: null, EditionId: null, AgentRunId: runId, Services: sp);
        var goal = $"Enrich metadata for '{title}'";

        try
        {
            var outcome = await agent.RunAsync(input, ctx, Threshold, ct);
            await PersistAsync(runWriter, runId, goal, outcome, ct);

            var r = outcome.Result;
            logger.LogInformation(
                "Enrichment agent book={Book} confidence={Conf:0.00} tools={Tools} genre={Genre} year={Year}",
                bookId, r.OverallConfidence, outcome.ToolCallsCount, r.Genre.Value, r.Year.Value);

            return new BookMetadataResult(
                r.Genre.Value,
                r.Year.Value,
                r.Description.Value,
                r.OverallConfidence,
                r.ToProvenanceJson());
        }
        catch (AgentBudgetExhaustedException ex)
        {
            // Budget-exhausted runs are exactly the ones worth inspecting: persist the partial transcript,
            // then degrade to the legacy single-shot generator so ingestion still gets best-effort metadata.
            // Count tool_result steps (one per dispatched tool call) — NOT total steps — so tool_calls_count
            // is consistent with the success path (EnrichmentRun.ToolCallsCount).
            var toolCalls = ex.Steps.Count(s => s.Kind == "tool_result");
            await TryPersistFailedAsync(runWriter, runId, goal, AgentRunRecordFactory.BudgetExhausted(
                runId, EnrichmentAgent.AgentName, null, null, goal, ex), toolCalls, ct);
            logger.LogWarning(ex, "Enrichment agent budget-exhausted for book {Book}; falling back to Ollama", bookId);
            return await fallback.GenerateAsync(title, author, needsDescription, ct);
        }
        catch (Exception ex)
        {
            await TryPersistFailedAsync(runWriter, runId, goal, AgentRunRecordFactory.Failed(
                runId, EnrichmentAgent.AgentName, null, null, goal, ex), 0, ct);
            logger.LogWarning(ex, "Enrichment agent failed for book {Book}; falling back to Ollama", bookId);
            return await fallback.GenerateAsync(title, author, needsDescription, ct);
        }
    }

    private static async Task PersistAsync(
        IAgentRunWriter writer, Guid runId, string goal, EnrichmentRun outcome, CancellationToken ct)
    {
        var record = AgentRunRecordFactory.Completed(
            runId, EnrichmentAgent.AgentName, null, null, goal, outcome.Run) with
        {
            Confidence = outcome.Result.OverallConfidence,
            ToolCallsCount = outcome.ToolCallsCount,
        };
        await writer.WriteAsync(record, ct);
    }

    private async Task TryPersistFailedAsync(
        IAgentRunWriter writer, Guid runId, string goal, AgentRunRecord record, int toolCalls, CancellationToken ct)
    {
        try
        {
            await writer.WriteAsync(record with { ToolCallsCount = toolCalls }, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to persist enrichment agent run {Run}", runId);
        }
    }
}
