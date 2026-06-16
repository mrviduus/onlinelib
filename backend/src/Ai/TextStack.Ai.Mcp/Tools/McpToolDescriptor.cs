using System.Text.Json;
using ModelContextProtocol.Protocol;

namespace TextStack.Ai.Mcp.Tools;

/// <summary>
/// A runtime MCP tool entry: its protocol descriptor (name/description/input
/// schema) plus the handler that fulfils a <c>tools/call</c>.
///
/// We drive the SDK's low-level <c>ListTools</c>/<c>CallTool</c> handlers from a
/// catalog of these (rather than <c>[McpServerTool]</c> attributes) so the tool
/// surface is data, not reflected methods — AI-048+ just append descriptors, and
/// the same schema can be the single source of truth across consumers.
/// </summary>
public sealed class McpToolDescriptor
{
    public required string Name { get; init; }

    public required string Description { get; init; }

    /// <summary>JSON Schema (draft 2020-12) for the tool's arguments object.</summary>
    public required JsonElement InputSchema { get; init; }

    /// <summary>
    /// Invokes the tool. <paramref name="arguments"/> is the raw args object from
    /// the MCP request (may be null when the client sends none). Returns a fully
    /// formed MCP result; handlers map errors to <c>IsError</c> results rather
    /// than throwing, so a tool failure is data the model can react to.
    /// </summary>
    public required Func<JsonElement?, CancellationToken, Task<CallToolResult>> Handler { get; init; }

    /// <summary>Projects the descriptor to the protocol <see cref="Tool"/> for tools/list.</summary>
    public Tool ToProtocolTool() => new()
    {
        Name = Name,
        Description = Description,
        InputSchema = InputSchema,
    };
}
