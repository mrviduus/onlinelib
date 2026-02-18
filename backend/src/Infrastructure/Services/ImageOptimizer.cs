using Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace Infrastructure.Services;

public class ImageOptimizer : IImageOptimizer
{
    private readonly ILogger<ImageOptimizer> _logger;

    public ImageOptimizer(ILogger<ImageOptimizer> logger)
    {
        _logger = logger;
    }

    private static readonly int[] QualitySteps = [90, 75, 60, 50, 40];

    public async Task<OptimizedImage> OptimizeAsync(byte[] data, string mimeType, int maxSizeKb = 200, CancellationToken ct = default)
    {
        var maxBytes = maxSizeKb * 1024;

        // SVG — return as-is
        if (mimeType.Equals("image/svg+xml", StringComparison.OrdinalIgnoreCase))
            return new OptimizedImage(data, mimeType, ".svg");

        // Already small enough — keep original format
        if (data.Length <= maxBytes)
        {
            var origExt = GetExtension(mimeType);
            return new OptimizedImage(data, mimeType, origExt);
        }

        // Load image
        using var image = Image.Load(data);

        // Try WebP at decreasing quality levels
        foreach (var quality in QualitySteps)
        {
            ct.ThrowIfCancellationRequested();
            var result = await EncodeWebPAsync(image, quality);
            if (result.Length <= maxBytes)
            {
                _logger.LogDebug("Optimized {OrigSize}KB → {NewSize}KB at q{Quality}",
                    data.Length / 1024, result.Length / 1024, quality);
                return new OptimizedImage(result, "image/webp", ".webp");
            }
        }

        // Still too large — progressively resize down
        var w = image.Width;
        var h = image.Height;
        foreach (var scale in new[] { 0.75, 0.5, 0.35, 0.25 })
        {
            ct.ThrowIfCancellationRequested();
            var newW = Math.Max(1, (int)(w * scale));
            var newH = Math.Max(1, (int)(h * scale));
            using var resized = image.Clone(ctx => ctx.Resize(newW, newH));

            var result = await EncodeWebPAsync(resized, 60);
            if (result.Length <= maxBytes)
            {
                _logger.LogDebug("Optimized {OrigSize}KB → {NewSize}KB at scale {Scale}",
                    data.Length / 1024, result.Length / 1024, scale);
                return new OptimizedImage(result, "image/webp", ".webp");
            }
        }

        // Last resort: smallest size + lowest quality
        var lastW = Math.Max(1, w / 4);
        var lastH = Math.Max(1, h / 4);
        using var lastResort = image.Clone(ctx => ctx.Resize(lastW, lastH));
        var final = await EncodeWebPAsync(lastResort, 40);
        _logger.LogWarning("Image still {Size}KB after all optimization attempts (original {OrigSize}KB)",
            final.Length / 1024, data.Length / 1024);
        return new OptimizedImage(final, "image/webp", ".webp");
    }

    private static async Task<byte[]> EncodeWebPAsync(Image image, int quality)
    {
        using var ms = new MemoryStream();
        var encoder = new WebpEncoder { Quality = quality };
        await image.SaveAsync(ms, encoder);
        return ms.ToArray();
    }

    private static string GetExtension(string mimeType) => mimeType switch
    {
        "image/png" => ".png",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        "image/svg+xml" => ".svg",
        _ => ".jpg"
    };
}
