using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TextStack.Tts;

public class EdgeTtsService : ITtsService, IHostedService
{
    private readonly TtsConfiguration _config;
    private readonly ILogger<EdgeTtsService> _logger;
    private readonly SemaphoreSlim _synthLock = new(3); // max 3 concurrent synthesis
    private List<EdgeVoiceData>? _cachedVoices;

    public EdgeTtsService(IOptions<TtsConfiguration> config, ILogger<EdgeTtsService> logger)
    {
        _config = config.Value;
        _logger = logger;
    }

    private bool _cacheAvailable;

    public Task StartAsync(CancellationToken ct)
    {
        try
        {
            Directory.CreateDirectory(_config.CachePath);
            _cacheAvailable = true;
            CleanExpiredCache();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TTS disk cache unavailable at {Path}, running without cache", _config.CachePath);
        }
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    public async Task<byte[]> SynthesizeAsync(string text, string lang, string? voice, double speed, CancellationToken ct)
    {
        voice ??= ResolveDefaultVoice(lang);
        var rate = SpeedToRate(speed);

        var cacheKey = ComputeCacheKey(text, voice, rate);
        var cachePath = _cacheAvailable ? Path.Combine(_config.CachePath, $"{cacheKey}.mp3") : null;

        // Cache hit
        if (cachePath != null && File.Exists(cachePath))
        {
            _logger.LogDebug("TTS cache hit: {Key}", cacheKey);
            return await File.ReadAllBytesAsync(cachePath, ct);
        }

        // Cache miss — synthesize
        await _synthLock.WaitAsync(ct);
        try
        {
            // Double-check after acquiring lock
            if (cachePath != null && File.Exists(cachePath))
                return await File.ReadAllBytesAsync(cachePath, ct);

            _logger.LogInformation("TTS synthesizing: voice={Voice}, text={Text}", voice, text[..Math.Min(50, text.Length)]);

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(_config.TimeoutSeconds));

            var audio = await EdgeTtsClient.SynthesizeAsync(text, voice, rate, "+0%", "+0Hz", cts.Token);

            if (audio.Length == 0)
                throw new InvalidOperationException("TTS returned empty audio");

            if (cachePath != null)
            {
                await File.WriteAllBytesAsync(cachePath, audio, ct);
                _logger.LogInformation("TTS cached: {Key} ({Size}KB)", cacheKey, audio.Length / 1024);
            }

            return audio;
        }
        finally
        {
            _synthLock.Release();
        }
    }

    public async Task<IReadOnlyList<TtsVoiceInfo>> GetVoicesAsync(string? lang, CancellationToken ct)
    {
        _cachedVoices ??= await EdgeTtsClient.GetVoicesAsync(ct);

        var voices = _cachedVoices.AsEnumerable();
        if (!string.IsNullOrEmpty(lang))
            voices = voices.Where(v => v.Locale.StartsWith(lang, StringComparison.OrdinalIgnoreCase));

        return voices
            .Select(v => new TtsVoiceInfo(
                v.Name,
                v.ShortName,
                v.Gender,
                v.Locale,
                v.Locale.Split('-')[0]))
            .OrderBy(v => v.ShortName)
            .ToList();
    }

    private string ResolveDefaultVoice(string lang)
    {
        var key = lang.Split('-')[0].ToLowerInvariant();
        return _config.DefaultVoices.TryGetValue(key, out var voice) ? voice : "en-US-AriaNeural";
    }

    private static string SpeedToRate(double speed) => speed switch
    {
        <= 0.75 => "-25%",
        <= 0.9 => "-10%",
        >= 2.0 => "+100%",
        >= 1.5 => "+50%",
        >= 1.25 => "+25%",
        >= 1.1 => "+10%",
        _ => "+0%"
    };

    private static string ComputeCacheKey(string text, string voice, string rate)
    {
        var input = $"{voice}|{rate}|{text}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexStringLower(hash)[..16];
    }

    private void CleanExpiredCache()
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddDays(-_config.CacheTtlDays);
            var dir = new DirectoryInfo(_config.CachePath);
            if (!dir.Exists) return;

            var deleted = 0;
            foreach (var file in dir.EnumerateFiles("*.mp3"))
            {
                if (file.LastWriteTimeUtc < cutoff)
                {
                    file.Delete();
                    deleted++;
                }
            }
            if (deleted > 0)
                _logger.LogInformation("TTS cache cleanup: deleted {Count} expired files", deleted);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TTS cache cleanup failed");
        }
    }
}
