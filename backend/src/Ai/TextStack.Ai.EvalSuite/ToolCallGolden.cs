namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One tool-call golden case (AI-033): an Explain input plus the round-1 behaviour a correct model
/// shows. <see cref="ExpectedTool"/> null = the model must answer directly (no tool) — most words
/// need none, and over-calling is as much a failure as under-calling.
/// <see cref="ExpectedArgFragments"/> maps argument name → substring the model's argument must
/// contain (case-insensitive; model-phrased args make exact matching brittle).
/// </summary>
public record ToolCallGolden(
    string Word,
    string Sentence,
    string? ExpectedTool,
    IReadOnlyDictionary<string, string>? ExpectedArgFragments);

/// <summary>Loads the embedded tool-call golden set (<c>toolcalls.json</c>).</summary>
public static class ToolCallGoldenSet
{
    public static IReadOnlyList<ToolCallGolden> Load() => GoldenLoader.Load<ToolCallGolden>("toolcalls.json");
}
