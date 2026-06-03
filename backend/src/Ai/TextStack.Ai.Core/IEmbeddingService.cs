namespace TextStack.Ai.Core;

/// <summary>Embedding provider abstraction. Single-call and batch variants; dimension exposed for storage sizing.</summary>
public interface IEmbeddingService
{
    /// <summary>Embeds a single text into a fixed-dimension vector.</summary>
    Task<float[]> EmbedAsync(string text, CancellationToken ct);

    /// <summary>Embeds a batch of texts; order preserved.</summary>
    Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct);

    /// <summary>Dimensionality of vectors returned by this service (e.g. 1536 for text-embedding-3-small).</summary>
    int Dimensions { get; }
}
