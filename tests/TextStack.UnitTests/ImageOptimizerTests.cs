using Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace TextStack.UnitTests;

public class ImageOptimizerTests
{
    private readonly ImageOptimizer _optimizer = new(NullLogger<ImageOptimizer>.Instance);

    private static byte[] CreateTestImage(int width, int height, string format = "jpeg")
    {
        using var image = new Image<Rgba32>(width, height, Color.Red);
        using var ms = new MemoryStream();
        if (format == "png")
            image.Save(ms, new PngEncoder());
        else
            image.Save(ms, new JpegEncoder { Quality = 100 });
        return ms.ToArray();
    }

    /// <summary>
    /// Creates a large image with smooth gradients — realistic for book covers/photos.
    /// Much more compressible than pure noise but still large as PNG/high-quality JPEG.
    /// </summary>
    private static byte[] CreateLargeGradientImage(int width, int height, string format)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < row.Length; x++)
                {
                    // Smooth gradient with some variation (simulates real photo)
                    var r = (byte)((x * 255) / width);
                    var g = (byte)((y * 255) / height);
                    var b = (byte)(((x + y) * 128) / (width + height));
                    row[x] = new Rgba32(r, g, b, 255);
                }
            }
        });

        using var ms = new MemoryStream();
        if (format == "png")
            image.Save(ms, new PngEncoder { CompressionLevel = PngCompressionLevel.NoCompression });
        else
            image.Save(ms, new JpegEncoder { Quality = 100 });
        return ms.ToArray();
    }

    [Fact]
    public async Task OptimizeAsync_SmallImage_ReturnsAsIs()
    {
        var data = CreateTestImage(100, 100);
        Assert.True(data.Length < 200 * 1024);

        var result = await _optimizer.OptimizeAsync(data, "image/jpeg");

        Assert.Equal(data, result.Data);
        Assert.Equal("image/jpeg", result.MimeType);
        Assert.Equal(".jpg", result.Extension);
    }

    [Fact]
    public async Task OptimizeAsync_SvgImage_ReturnsAsIs()
    {
        var svgData = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='100' height='100'/></svg>"u8.ToArray();

        var result = await _optimizer.OptimizeAsync(svgData, "image/svg+xml");

        Assert.Equal(svgData, result.Data);
        Assert.Equal("image/svg+xml", result.MimeType);
        Assert.Equal(".svg", result.Extension);
    }

    [Fact]
    public async Task OptimizeAsync_LargeJpeg_ReturnsWebP()
    {
        var data = CreateLargeGradientImage(3000, 3000, "jpeg");
        Assert.True(data.Length > 200 * 1024, $"Test image should be >200KB, was {data.Length / 1024}KB");

        var result = await _optimizer.OptimizeAsync(data, "image/jpeg");

        Assert.True(result.Data.Length < data.Length, "Result should be smaller than original");
        Assert.Equal("image/webp", result.MimeType);
        Assert.Equal(".webp", result.Extension);
    }

    [Fact]
    public async Task OptimizeAsync_LargePng_ReturnsWebP()
    {
        var data = CreateLargeGradientImage(3000, 3000, "png");
        Assert.True(data.Length > 200 * 1024, $"Test image should be >200KB, was {data.Length / 1024}KB");

        var result = await _optimizer.OptimizeAsync(data, "image/png");

        Assert.True(result.Data.Length < data.Length, "Result should be smaller than original");
        Assert.Equal("image/webp", result.MimeType);
        Assert.Equal(".webp", result.Extension);
    }

    [Fact]
    public async Task OptimizeAsync_ReturnsCorrectMimeType()
    {
        var data = CreateLargeGradientImage(3000, 3000, "jpeg");
        Assert.True(data.Length > 200 * 1024);

        var result = await _optimizer.OptimizeAsync(data, "image/jpeg");

        Assert.Equal("image/webp", result.MimeType);
    }

    [Fact]
    public async Task OptimizeAsync_ReturnsCorrectExtension()
    {
        var data = CreateLargeGradientImage(3000, 3000, "png");
        Assert.True(data.Length > 200 * 1024);

        var result = await _optimizer.OptimizeAsync(data, "image/png");

        Assert.Equal(".webp", result.Extension);
    }
}
