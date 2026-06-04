using Application.Common.Interfaces;
using Domain.Entities;

namespace Application.Ai;

/// <summary>
/// Persists AI Core.LlmTrace records to Postgres via <see cref="IAppDbContext"/>.
/// Scoped (owns a per-request DbContext) — the singleton TracingDecorator
/// resolves it inside a fresh DI scope per write. Core types are written as
/// global:: to avoid the namespace clash (Application.* vs TextStack.*) and the
/// type-name clash with the EF entity <see cref="LlmTrace"/>.
/// </summary>
public sealed class DbLlmTraceWriter(IAppDbContext db) : global::TextStack.Ai.Core.ILlmTraceWriter
{
    public async Task WriteAsync(global::TextStack.Ai.Core.LlmTrace trace, CancellationToken ct)
    {
        db.LlmTraces.Add(new LlmTrace
        {
            Id = trace.Id,
            FeatureTag = trace.FeatureTag,
            ModelId = trace.ModelId,
            PromptHash = trace.PromptHash,
            SystemPrompt = trace.SystemPrompt,
            MessagesJson = trace.MessagesJson,
            ResponseText = trace.ResponseText,
            ToolCallsJson = trace.ToolCallsJson,
            TokensIn = trace.TokensIn,
            TokensOut = trace.TokensOut,
            CostUsd = trace.CostUsd,
            LatencyMs = trace.LatencyMs,
            UserId = trace.UserId,
            TraceParentId = trace.TraceParentId,
            Error = trace.Error,
            CreatedAt = trace.CreatedAt,
        });
        await db.SaveChangesAsync(ct);
    }
}
