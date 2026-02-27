using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TextStack.Tts;

namespace TextStack.UnitTests;

public class EdgeTtsServiceTests
{
    private static EdgeTtsService CreateService(string? cachePath = null)
    {
        var config = new TtsConfiguration
        {
            CachePath = cachePath ?? Path.Combine(Path.GetTempPath(), $"tts-test-{Guid.NewGuid():N}"),
            MaxTextLength = 500,
            TimeoutSeconds = 15,
            CacheTtlDays = 30,
        };
        return new EdgeTtsService(
            Options.Create(config),
            NullLogger<EdgeTtsService>.Instance);
    }

    [Fact]
    public async Task StartAsync_CreatesDirectory_WhenPathValid()
    {
        var service = CreateService();
        var dir = GetCachePath(service);

        await service.StartAsync(CancellationToken.None);

        Assert.True(Directory.Exists(dir));
        Directory.Delete(dir, true);
    }

    [Fact]
    public async Task StartAsync_InvalidPath_DoesNotThrow()
    {
        var service = CreateService("/nonexistent/deep/path/that/should/fail");
        await service.StartAsync(CancellationToken.None);
        // Should not throw — graceful degradation
    }

    [Theory]
    [InlineData(0.75, "-25%")]
    [InlineData(1.0, "+0%")]
    [InlineData(1.25, "+25%")]
    [InlineData(1.5, "+50%")]
    [InlineData(2.0, "+100%")]
    public void SpeedToRate_MapsCorrectly(double speed, string expected)
    {
        // Use reflection to test private static method
        var method = typeof(EdgeTtsService).GetMethod(
            "SpeedToRate",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        Assert.NotNull(method);
        var result = method.Invoke(null, [speed]);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("en", "en-US-AriaNeural")]
    [InlineData("uk", "uk-UA-PolinaNeural")]
    [InlineData("en-US", "en-US-AriaNeural")]
    [InlineData("fr", "en-US-AriaNeural")] // fallback to en
    public void ResolveDefaultVoice_ReturnsExpected(string lang, string expected)
    {
        var service = CreateService();
        var method = typeof(EdgeTtsService).GetMethod(
            "ResolveDefaultVoice",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);

        Assert.NotNull(method);
        var result = method.Invoke(service, [lang]);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void ComputeCacheKey_SameInput_SameOutput()
    {
        var method = typeof(EdgeTtsService).GetMethod(
            "ComputeCacheKey",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        Assert.NotNull(method);

        var key1 = method.Invoke(null, ["hello", "en-US-AriaNeural", "+0%"]);
        var key2 = method.Invoke(null, ["hello", "en-US-AriaNeural", "+0%"]);
        Assert.Equal(key1, key2);
    }

    [Fact]
    public void ComputeCacheKey_DifferentInput_DifferentOutput()
    {
        var method = typeof(EdgeTtsService).GetMethod(
            "ComputeCacheKey",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        Assert.NotNull(method);

        var key1 = method.Invoke(null, ["hello", "en-US-AriaNeural", "+0%"]);
        var key2 = method.Invoke(null, ["world", "en-US-AriaNeural", "+0%"]);
        Assert.NotEqual(key1, key2);
    }

    [Fact]
    public void ComputeCacheKey_DifferentVoice_DifferentKey()
    {
        var method = typeof(EdgeTtsService).GetMethod(
            "ComputeCacheKey",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        Assert.NotNull(method);

        var key1 = method.Invoke(null, ["hello", "en-US-AriaNeural", "+0%"]);
        var key2 = method.Invoke(null, ["hello", "uk-UA-PolinaNeural", "+0%"]);
        Assert.NotEqual(key1, key2);
    }

    [Fact]
    public void ComputeCacheKey_DifferentRate_DifferentKey()
    {
        var method = typeof(EdgeTtsService).GetMethod(
            "ComputeCacheKey",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        Assert.NotNull(method);

        var key1 = method.Invoke(null, ["hello", "en-US-AriaNeural", "+0%"]);
        var key2 = method.Invoke(null, ["hello", "en-US-AriaNeural", "+50%"]);
        Assert.NotEqual(key1, key2);
    }

    [Fact]
    public void ComputeCacheKey_Is16CharsHex()
    {
        var method = typeof(EdgeTtsService).GetMethod(
            "ComputeCacheKey",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        Assert.NotNull(method);

        var key = (string)method.Invoke(null, ["test", "en-US-AriaNeural", "+0%"])!;
        Assert.Equal(16, key.Length);
        Assert.Matches("^[0-9a-f]{16}$", key);
    }

    [Fact]
    public async Task CleanExpiredCache_RemovesOldFiles()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), $"tts-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmpDir);

        // Create old file
        var oldFile = Path.Combine(tmpDir, "old.mp3");
        await File.WriteAllTextAsync(oldFile, "old");
        File.SetLastWriteTimeUtc(oldFile, DateTime.UtcNow.AddDays(-31));

        // Create recent file
        var newFile = Path.Combine(tmpDir, "new.mp3");
        await File.WriteAllTextAsync(newFile, "new");

        var service = CreateService(tmpDir);
        await service.StartAsync(CancellationToken.None);

        Assert.False(File.Exists(oldFile));
        Assert.True(File.Exists(newFile));

        Directory.Delete(tmpDir, true);
    }

    [Fact]
    public async Task CleanExpiredCache_EmptyDir_NoError()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), $"tts-test-{Guid.NewGuid():N}");
        var service = CreateService(tmpDir);
        await service.StartAsync(CancellationToken.None);
        // Should not throw
        Directory.Delete(tmpDir, true);
    }

    [Fact]
    public async Task SynthesizeAsync_CacheHit_ReturnsFromFile()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), $"tts-test-{Guid.NewGuid():N}");
        var service = CreateService(tmpDir);
        await service.StartAsync(CancellationToken.None);

        // Pre-seed the cache with a known file
        var method = typeof(EdgeTtsService).GetMethod(
            "ComputeCacheKey",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var key = (string)method.Invoke(null, ["cached-word", "en-US-AriaNeural", "+0%"])!;
        var cachePath = Path.Combine(tmpDir, $"{key}.mp3");
        var fakeAudio = new byte[] { 0xFF, 0xFB, 0x90, 0x00 }; // fake MP3 header
        await File.WriteAllBytesAsync(cachePath, fakeAudio);

        var result = await service.SynthesizeAsync("cached-word", "en", null, 1.0, CancellationToken.None);

        Assert.Equal(fakeAudio, result);
        Directory.Delete(tmpDir, true);
    }

    private static string GetCachePath(EdgeTtsService service)
    {
        var field = typeof(EdgeTtsService).GetField("_config",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        var config = (TtsConfiguration)field.GetValue(service)!;
        return config.CachePath;
    }
}
