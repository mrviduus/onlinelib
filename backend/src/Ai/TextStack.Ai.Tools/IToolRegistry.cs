using TextStack.Ai.Core;

namespace TextStack.Ai.Tools;

/// <summary>
/// The single catalogue of <see cref="ITool"/>s (ADR-AI-005), shared by function-calling (Phase 5),
/// agents (Phase 6) and MCP. Tools are defined once and registered in DI; the registry indexes them by
/// <see cref="ITool.Name"/> for dispatch and exposes their schemas to send to the LLM.
/// </summary>
public interface IToolRegistry
{
    /// <summary>The registered tool with this name, or null if none — callers turn null into a clear error.</summary>
    ITool? Get(string name);

    /// <summary>
    /// Schemas for the named tools, in request order, de-duplicated; unknown names are skipped (the
    /// registry is the source of truth). Used to populate <c>LlmRequest.Tools</c> for a call.
    /// </summary>
    IReadOnlyList<ToolSchema> SchemasFor(IEnumerable<string> names);

    /// <summary>Schemas for every registered tool.</summary>
    IReadOnlyList<ToolSchema> AllSchemas();

    /// <summary>Names of every registered tool.</summary>
    IReadOnlyCollection<string> Names { get; }
}
