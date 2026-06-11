using TextStack.Ai.Core;

namespace TextStack.Ai.Tools;

/// <summary>
/// Default <see cref="IToolRegistry"/>: indexes the DI-registered <see cref="ITool"/>s by name once at
/// construction. Tool names are stable identifiers (matched case-sensitively against
/// <see cref="ToolCall.ToolName"/>), so a blank or duplicated name is a wiring bug and fails fast here
/// rather than surfacing as a confusing "unknown tool" at dispatch time.
/// </summary>
public sealed class ToolRegistry : IToolRegistry
{
    private readonly IReadOnlyDictionary<string, ITool> _byName;
    private readonly IReadOnlyDictionary<string, ToolSchema> _schemas;

    public ToolRegistry(IEnumerable<ITool> tools)
    {
        var byName = new Dictionary<string, ITool>(StringComparer.Ordinal);
        foreach (var tool in tools)
        {
            if (string.IsNullOrWhiteSpace(tool.Name))
                throw new InvalidOperationException($"Tool {tool.GetType().Name} has a blank Name.");
            if (!byName.TryAdd(tool.Name, tool))
                throw new InvalidOperationException(
                    $"Duplicate tool name '{tool.Name}': {byName[tool.Name].GetType().Name} and {tool.GetType().Name}.");
        }

        _byName = byName;
        _schemas = byName.ToDictionary(
            kv => kv.Key,
            kv => new ToolSchema(kv.Value.Name, kv.Value.Description, kv.Value.ArgsSchema),
            StringComparer.Ordinal);
    }

    public ITool? Get(string name) => _byName.GetValueOrDefault(name);

    public IReadOnlyList<ToolSchema> SchemasFor(IEnumerable<string> names)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<ToolSchema>();
        foreach (var name in names)
        {
            if (seen.Add(name) && _schemas.TryGetValue(name, out var schema))
                result.Add(schema);
        }
        return result;
    }

    public IReadOnlyList<ToolSchema> AllSchemas() => _schemas.Values.ToList();

    public IReadOnlyCollection<string> Names => _byName.Keys.ToList();
}
