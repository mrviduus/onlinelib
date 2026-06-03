using System.Text.Json;

namespace TextStack.Ai.Core;

/// <summary>One tool invocation requested by the model. Arguments are raw JSON validated by the registry before dispatch.</summary>
public record ToolCall(string Id, string ToolName, JsonElement Arguments);

/// <summary>The schema-only view of a tool — sent to the LLM during function-calling. No invocation logic here.</summary>
public record ToolSchema(string Name, string Description, JsonElement ArgsSchema);

/// <summary>Per-invocation context for a tool: identity, current edition, agent run id and a scoped service provider.</summary>
public record ToolContext(
    Guid? UserId,
    Guid? EditionId,
    Guid AgentRunId,
    IServiceProvider Services);
