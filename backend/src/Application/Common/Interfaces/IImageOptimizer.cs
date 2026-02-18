namespace Application.Common.Interfaces;

public interface IImageOptimizer
{
    Task<OptimizedImage> OptimizeAsync(byte[] data, string mimeType, int maxSizeKb = 200, CancellationToken ct = default);
}

public record OptimizedImage(byte[] Data, string MimeType, string Extension);
