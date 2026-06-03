using System.Text.Json;

namespace TextStack.Ai.Core;

/// <summary>
/// A tool callable by function-calling, agents, and MCP. Defined once, reused everywhere.
/// </summary>
public interface ITool
{
    /// <summary>Stable identifier referenced in <see cref="ToolCall.ToolName"/> and <see cref="ToolSchema.Name"/>.</summary>
    string Name { get; }

    /// <summary>Human-readable description; the LLM uses this to decide when to call.</summary>
    string Description { get; }

    /// <summary>JSON Schema (draft 2020-12) describing the tool's argument object.</summary>
    JsonElement ArgsSchema { get; }

    /// <summary>Executes the tool with validated arguments and returns a JSON result.</summary>
    Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct);
}
