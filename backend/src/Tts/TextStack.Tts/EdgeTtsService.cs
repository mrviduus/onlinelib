using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TextStack.Tts;

public class EdgeTtsService : ITtsService, IHostedService, IDisposable
{
    private readonly TtsConfiguration _config;
    private readonly ILogger<EdgeTtsService> _logger;
    private readonly SemaphoreSlim _synthLock;
    private readonly SemaphoreSlim _voicesLock = new(1, 1); // serialize voice-list fetch
    private List<EdgeVoiceData>? _cachedVoices;
    private DateTime _cachedVoicesAtUtc;
    private Timer? _cacheSweepTimer;
    // Re-entrancy guard for SweepCache. System.Threading.Timer can fire a
    // second callback on a different ThreadPool thread before the first
    // returns (sweep on a slow disk could outrun a short interval, or the
    // CacheSweepInterval could be tuned down). Two concurrent sweeps would
    // race on the same FileInfo set, doubling delete attempts and the "X
    // delete(s) failed" warning. 0 = idle, 1 = running.
    private int _sweepInProgress;
    private static readonly TimeSpan CacheSweepInterval = TimeSpan.FromHours(1);
    private static readonly TimeSpan VoicesTtl = TimeSpan.FromHours(24);
    // On refresh failure, retry sooner than the normal TTL so we recover
    // quickly from a transient outage instead of waiting a full day.
    private static readonly TimeSpan VoicesRefreshBackoff = TimeSpan.FromMinutes(5);

    public EdgeTtsService(IOptions<TtsConfiguration> config, ILogger<EdgeTtsService> logger)
    {
        _config = config.Value;
        _logger = logger;
        var concurrency = Math.Max(1, _config.MaxConcurrentSynths);
        _synthLock = new SemaphoreSlim(concurrency, concurrency);
    }

    private bool _cacheAvailable;

    public Task StartAsync(CancellationToken ct)
    {
        try
        {
            Directory.CreateDirectory(_config.CachePath);
            _cacheAvailable = true;
            // Off-load sweeps to avoid blocking startup or pinning the Timer thread.
            _ = Task.Run(SweepCache);
            _cacheSweepTimer = new Timer(_ => Task.Run(SweepCache), null, CacheSweepInterval, CacheSweepInterval);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TTS disk cache unavailable at {Path}, running without cache", _config.CachePath);
        }
        // Pre-warm Bing voices list so the first synth skips the WS round-trip.
        _ = Task.Run(async () =>
        {
            try { await GetVoicesAsync(null, CancellationToken.None); }
            catch (Exception ex) { _logger.LogDebug(ex, "TTS voice pre-warm failed (will retry lazily)"); }
        });
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken ct)
    {
        // DisposeAsync waits for any in-flight Timer callback to return, but
        // our callback is `_ => Task.Run(SweepCache)` — the lambda returns
        // immediately while the actual sweep continues on a different thread.
        // So we additionally poll _sweepInProgress to give that work a chance
        // to finish (with a bounded deadline so a wedged sweep can't block
        // shutdown indefinitely).
        if (_cacheSweepTimer != null)
        {
            await _cacheSweepTimer.DisposeAsync();
            _cacheSweepTimer = null;
        }

        var waitMs = Math.Max(0, _config.ShutdownSweepWaitSeconds) * 1000;
        var deadline = Environment.TickCount + waitMs;
        while (Volatile.Read(ref _sweepInProgress) != 0 && Environment.TickCount < deadline)
        {
            try { await Task.Delay(50, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    public void Dispose()
    {
        _cacheSweepTimer?.Dispose();
        _synthLock.Dispose();
        _voicesLock.Dispose();
        GC.SuppressFinalize(this);
    }

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
            TouchCacheFile(cachePath);
            return await File.ReadAllBytesAsync(cachePath, ct);
        }

        // Cache miss — synthesize
        await _synthLock.WaitAsync(ct);
        try
        {
            // Double-check after acquiring lock
            if (cachePath != null && File.Exists(cachePath))
            {
                TouchCacheFile(cachePath);
                return await File.ReadAllBytesAsync(cachePath, ct);
            }

            _logger.LogInformation("TTS synthesizing: voice={Voice}, text={Text}", voice, text[..Math.Min(50, text.Length)]);

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(_config.TimeoutSeconds));

            var audio = await EdgeTtsClient.SynthesizeAsync(text, voice, rate, "+0%", "+0Hz", lang, cts.Token, _config.MaxAudioBytes);

            if (audio.Length == 0)
                throw new InvalidOperationException("TTS returned empty audio");

            if (cachePath != null)
            {
                // Atomic write: tmp file + rename. Direct WriteAllBytesAsync to
                // the final path leaves a partial/corrupt .mp3 if the process is
                // killed mid-write — and File.Exists() on next call would treat
                // it as a cache hit, serving broken audio forever (TTL won't
                // help since mtime is fresh). Tmp+Move ensures the final path
                // either contains the complete payload or doesn't exist.
                // Per-call random suffix avoids collisions when two callers race
                // on the same key (lock above prevents that today, but the file
                // op is safe regardless).
                var tmpPath = cachePath + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp";
                try
                {
                    await File.WriteAllBytesAsync(tmpPath, audio, ct);
                    File.Move(tmpPath, cachePath, overwrite: true);
                    _logger.LogInformation("TTS cached: {Key} ({Size}KB)", cacheKey, audio.Length / 1024);
                }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                {
                    _logger.LogWarning(ex, "TTS cache write failed for {Key}, returning audio without caching", cacheKey);
                    try { if (File.Exists(tmpPath)) File.Delete(tmpPath); }
                    catch (Exception cleanupEx) when (cleanupEx is UnauthorizedAccessException or IOException) { }
                }
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
        // Serialize first fetch so concurrent callers don't both hit Bing, and
        // a transient failure doesn't permanently null out the cache field
        // (`??=` would leave _cachedVoices null on throw, but every subsequent
        // caller would refetch; we want that, not block — keep null on failure).
        // TTL refresh: Microsoft occasionally adds/removes voices — without
        // expiry the process has to restart to pick them up.
        if (IsVoicesStale())
        {
            await _voicesLock.WaitAsync(ct);
            try
            {
                if (IsVoicesStale())
                {
                    try
                    {
                        var fresh = await EdgeTtsClient.GetVoicesAsync(ct);
                        // Guard: if Bing returns empty transiently, don't trash
                        // an existing populated cache. Better stale-real than fresh-empty.
                        if (fresh.Count > 0 || _cachedVoices == null)
                        {
                            _cachedVoices = fresh;
                            _cachedVoicesAtUtc = DateTime.UtcNow;
                        }
                        else
                        {
                            _logger.LogWarning("TTS voices fetch returned empty list; keeping previous cache");
                            _cachedVoicesAtUtc = DateTime.UtcNow; // avoid hammering on transient empties
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        // First-ever fetch failed — no cache to serve, surface the error.
                        if (_cachedVoices == null) throw;

                        // Refresh of existing cache failed — serve stale. Bump
                        // the timestamp by a short backoff so the next caller
                        // retries soon (not immediately), not in a full TTL.
                        _logger.LogWarning(ex, "TTS voices refresh failed; serving stale cache for {Backoff}", VoicesRefreshBackoff);
                        _cachedVoicesAtUtc = DateTime.UtcNow - VoicesTtl + VoicesRefreshBackoff;
                    }
                }
            }
            finally
            {
                _voicesLock.Release();
            }
        }

        var voices = (_cachedVoices ?? new List<EdgeVoiceData>()).AsEnumerable();
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

    private bool IsVoicesStale()
        => _cachedVoices == null || DateTime.UtcNow - _cachedVoicesAtUtc > VoicesTtl;

    private string ResolveDefaultVoice(string lang)
    {
        var key = lang.Split('-')[0].ToLowerInvariant();
        if (_config.DefaultVoices.TryGetValue(key, out var voice)) return voice;

        // Fallback to whatever the Bing voice list offers for this lang (if we've
        // already loaded it). Previously any lang outside en/uk silently used
        // an English voice — Spanish text read by en-US-AriaNeural etc.
        var loaded = _cachedVoices;
        if (loaded != null)
        {
            var match = loaded.FirstOrDefault(v =>
                v.Locale.StartsWith(key + "-", StringComparison.OrdinalIgnoreCase));
            if (match != null) return match.ShortName;
        }

        _logger.LogWarning("TTS: no default voice for lang={Lang}, falling back to en-US-AriaNeural", lang);
        return "en-US-AriaNeural";
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

    // Bump LastWriteTimeUtc on cache hit so SweepCache's TTL + size eviction
    // behave as true LRU (recently-used files survive) instead of purging by
    // original write age. LastAccessTimeUtc would be natural, but Linux
    // typically mounts with `noatime` and doesn't update it — manual touch
    // is portable. Best-effort: silently ignore IO failures.
    //
    // Coalesce: only write when the existing mtime is older than the coalesce
    // window. A hot file hit 1000x/hour generates one write instead of 1000 —
    // critical on networked filesystems (NFS/EFS) where write syscalls are
    // orders of magnitude slower than the cache read itself. The precision
    // loss is at most TouchCoalesceWindow, which is << TTL and << sweep
    // interval, so LRU ordering stays correct.
    private static readonly TimeSpan TouchCoalesceWindow = TimeSpan.FromHours(1);
    private static void TouchCacheFile(string path)
    {
        try
        {
            var mtime = File.GetLastWriteTimeUtc(path);
            if (DateTime.UtcNow - mtime < TouchCoalesceWindow) return;
            File.SetLastWriteTimeUtc(path, DateTime.UtcNow);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException) { }
    }

    // Two-pass sweep: (1) TTL expiry, (2) if still over MaxCacheSizeBytes,
    // evict oldest files until under the budget. Runs at startup and on a
    // periodic Timer so long-lived servers don't drift past the declared
    // cap (config.MaxCacheSizeBytes was defined but previously never honored).
    //
    // Outer wrapper: owns the _sweepInProgress flag and guarantees release.
    // Splitting the work into a separate method keeps the acquire/release
    // contract tight — no path between CompareExchange and try/finally
    // could possibly throw and orphan the flag (previously the body sat
    // directly under the CompareExchange; safe today but fragile against
    // future edits).
    private void SweepCache()
    {
        // Skip if a previous sweep is still running. Don't queue — the next
        // periodic tick will pick up whatever this one missed.
        if (Interlocked.CompareExchange(ref _sweepInProgress, 1, 0) != 0)
        {
            _logger.LogDebug("TTS cache sweep already in progress, skipping this tick");
            return;
        }
        try
        {
            SweepCacheCore();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TTS cache sweep failed");
        }
        finally
        {
            Interlocked.Exchange(ref _sweepInProgress, 0);
        }
    }

    private void SweepCacheCore()
    {
        var dir = new DirectoryInfo(_config.CachePath);
        if (!dir.Exists) return;

        var cutoff = DateTime.UtcNow.AddDays(-_config.CacheTtlDays);
        var tmpCutoff = DateTime.UtcNow.AddMinutes(-10);
        long totalBytes = 0;
        var deleted = 0;
        // Track delete failures so persistent permission/lock issues become
        // visible — silently swallowed, the cache would grow past
        // MaxCacheSizeBytes with no operator signal. Aggregate per sweep
        // (don't log per-file: that would spam on a bad mount).
        var failed = 0;
        Exception? lastFailure = null;

        // Two filtered enumerations: lets the OS-level glob filter do the
        // work. EnumerateFiles() with no pattern would force us to walk every
        // entry (logs, .DS_Store, future neighbours) and string-compare the
        // extension twice per file — wasted IO on a busy mount.
        // Both enumerations are lazy (no upfront materialization).

        // Reap orphan .tmp files left behind by killed writes — they never
        // get promoted to .mp3 (atomic rename never ran) and nothing else
        // would clean them up.
        foreach (var tmp in dir.EnumerateFiles("*.tmp"))
        {
            if (tmp.LastWriteTimeUtc < tmpCutoff)
            {
                try { tmp.Delete(); deleted++; }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException) { failed++; lastFailure = ex; }
            }
        }

        // Pass 1: TTL expiry — survivors collected for potential pass 2.
        var survivors = new List<FileInfo>();
        foreach (var file in dir.EnumerateFiles("*.mp3"))
        {
            if (file.LastWriteTimeUtc < cutoff)
            {
                try { file.Delete(); deleted++; }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException) { failed++; lastFailure = ex; }
            }
            else
            {
                survivors.Add(file);
                totalBytes += file.Length;
            }
        }

        // Pass 2: size enforcement (LRU by LastWriteTimeUtc). Sort in place
        // to avoid the OrderBy intermediate allocation.
        if (totalBytes > _config.MaxCacheSizeBytes)
        {
            survivors.Sort(static (a, b) => a.LastWriteTimeUtc.CompareTo(b.LastWriteTimeUtc));
            foreach (var file in survivors)
            {
                if (totalBytes <= _config.MaxCacheSizeBytes) break;
                var size = file.Length;
                try
                {
                    file.Delete();
                    totalBytes -= size;
                    deleted++;
                }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException) { failed++; lastFailure = ex; }
            }
        }

        if (deleted > 0)
            _logger.LogInformation("TTS cache sweep: deleted {Count} files, size={SizeMb}MB", deleted, totalBytes / 1024 / 1024);
        if (failed > 0)
            _logger.LogWarning(lastFailure, "TTS cache sweep: {Failed} delete(s) failed (last error shown)", failed);
    }
}
