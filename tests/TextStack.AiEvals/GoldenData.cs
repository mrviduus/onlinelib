using System.Text.Json;

namespace TextStack.AiEvals;

/// <summary>Loads a golden dataset from <c>Datasets/{fileName}</c> (copied to the
/// test output dir). Case-insensitive so JSON camelCase maps onto record props.</summary>
internal static class GoldenData
{
    private static readonly JsonSerializerOptions Opts = new() { PropertyNameCaseInsensitive = true };

    public static IReadOnlyList<T> Load<T>(string fileName)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Datasets", fileName);
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<T>>(json, Opts)
            ?? throw new InvalidOperationException($"{fileName} deserialized to null");
    }
}
