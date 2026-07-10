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
        using var stream = OpenResource("Datasets." + fileName);
        return JsonSerializer.Deserialize<List<T>>(stream, Opts)
            ?? throw new InvalidOperationException($"{fileName} deserialized to null");
    }

    /// <summary>Loads a golden dataset whose root JSON is a single object (not an array) — e.g. the
    /// <c>pdfvision.json</c> golden, which pairs a page set with a question set in one document.</summary>
    public static T LoadSingle<T>(string fileName)
    {
        using var stream = OpenResource("Datasets." + fileName);
        return JsonSerializer.Deserialize<T>(stream, Opts)
            ?? throw new InvalidOperationException($"{fileName} deserialized to null");
    }

    /// <summary>Reads the raw bytes of an embedded non-JSON fixture (e.g. a <c>Datasets/pdfvision/*.jpg</c>
    /// table-page image) by its resource suffix, so the same fixtures ship to the API + the test suite.</summary>
    public static byte[] LoadBytes(string resourceSuffix)
    {
        using var stream = OpenResource(resourceSuffix);
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        return ms.ToArray();
    }

    private static Stream OpenResource(string suffix)
    {
        var asm = typeof(GoldenLoader).Assembly;
        var resource = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith(suffix, StringComparison.Ordinal))
            ?? throw new InvalidOperationException($"Embedded resource not found: {suffix}");
        return asm.GetManifestResourceStream(resource)!;
    }
}
