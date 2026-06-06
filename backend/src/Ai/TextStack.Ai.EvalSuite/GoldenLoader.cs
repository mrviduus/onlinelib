using System.Reflection;
using System.Text.Json;

namespace TextStack.Ai.EvalSuite;

/// <summary>Loads a golden dataset from the assembly's embedded <c>Datasets/*.json</c>
/// so the same goldens ship to the API (admin "Run evals") and the test suite.</summary>
internal static class GoldenLoader
{
    private static readonly JsonSerializerOptions Opts = new() { PropertyNameCaseInsensitive = true };

    public static IReadOnlyList<T> Load<T>(string fileName)
    {
        var asm = typeof(GoldenLoader).Assembly;
        var resource = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("Datasets." + fileName, StringComparison.Ordinal))
            ?? throw new InvalidOperationException($"Embedded golden not found: {fileName}");
        using var stream = asm.GetManifestResourceStream(resource)!;
        return JsonSerializer.Deserialize<List<T>>(stream, Opts)
            ?? throw new InvalidOperationException($"{fileName} deserialized to null");
    }
}
