using System.Diagnostics;
using Microsoft.Extensions.Logging;
using TextStack.Tts;

namespace Worker.Services;

public interface IAudioAssembler
{
    /// <summary>Synthesize each script line with its host voice and ffmpeg-concat into
    /// one mp3. Returns the bytes + an estimated duration, or null if nothing usable.</summary>
    Task<PodcastAudio?> AssembleAsync(PodcastScript script, string lang, CancellationToken ct);
}

public record PodcastAudio(byte[] Mp3, int DurationSeconds);

/// <summary>
/// Phase 3 (AI-013): turns an Aria/Guy dialogue script into a single mp3 — Edge TTS voices
/// each line (free), ffmpeg concatenates the segments (no re-encode). Pure helpers
/// (VoiceFor / BuildConcatFileContent / EstimateDurationSeconds) are unit-tested; the
/// full synth+ffmpeg path runs in the Worker (AI-014) where ffmpeg is on the image.
/// </summary>
public class AudioAssembler(ITtsService tts, ILogger<AudioAssembler> logger) : IAudioAssembler
{
    private const string AriaVoice = "en-US-AriaNeural";
    private const string GuyVoice = "en-US-GuyNeural";
    private const int Mp3BitsPerSecond = 48_000; // Edge mp3 is CBR 48 kbit/s mono

    public async Task<PodcastAudio?> AssembleAsync(PodcastScript script, string lang, CancellationToken ct)
    {
        if (script.Lines.Count == 0)
            return null;

        var jobDir = Path.Combine(Path.GetTempPath(), "ts-podcast", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(jobDir);
        try
        {
            var segments = new List<string>();
            var index = 0;
            foreach (var turn in script.Lines)
            {
                ct.ThrowIfCancellationRequested();
                var audio = await tts.SynthesizeAsync(turn.Line, lang, VoiceFor(turn.Speaker), 1.0, ct);
                if (audio.Length == 0)
                {
                    logger.LogWarning("Empty TTS for line {Index} ({Speaker}); skipping", index, turn.Speaker);
                    continue;
                }
                var segPath = Path.Combine(jobDir, $"seg_{index:D4}.mp3");
                await File.WriteAllBytesAsync(segPath, audio, ct);
                segments.Add(segPath);
                index++;
            }

            if (segments.Count == 0)
                return null;

            var listPath = Path.Combine(jobDir, "list.txt");
            await File.WriteAllTextAsync(listPath, BuildConcatFileContent(segments), ct);

            var outPath = Path.Combine(jobDir, "out.mp3");
            if (!await RunFfmpegConcatAsync(listPath, outPath, ct))
                return null;

            var bytes = await File.ReadAllBytesAsync(outPath, ct);
            return new PodcastAudio(bytes, EstimateDurationSeconds(bytes.Length));
        }
        finally
        {
            try { Directory.Delete(jobDir, recursive: true); }
            catch (Exception ex) { logger.LogWarning(ex, "Podcast temp cleanup failed: {Dir}", jobDir); }
        }
    }

    /// <summary>Map a script speaker to an Edge voice (Aria=female, anyone else=Guy/male).</summary>
    public static string VoiceFor(string speaker) =>
        speaker.Trim().Equals("Aria", StringComparison.OrdinalIgnoreCase) ? AriaVoice : GuyVoice;

    /// <summary>ffmpeg concat-demuxer list: one <c>file '...'</c> per segment, single-quotes escaped.</summary>
    public static string BuildConcatFileContent(IEnumerable<string> absolutePaths) =>
        string.Join("\n", absolutePaths.Select(p => $"file '{p.Replace("'", @"'\''")}'"));

    /// <summary>Estimate seconds from mp3 byte length at the fixed Edge bitrate.</summary>
    public static int EstimateDurationSeconds(long mp3Bytes) =>
        (int)Math.Round(mp3Bytes * 8.0 / Mp3BitsPerSecond);

    private async Task<bool> RunFfmpegConcatAsync(string listPath, string outPath, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "ffmpeg",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var arg in new[] { "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath })
            psi.ArgumentList.Add(arg);

        try
        {
            using var proc = Process.Start(psi);
            if (proc is null)
            {
                logger.LogError("Failed to start ffmpeg");
                return false;
            }
            var stderr = await proc.StandardError.ReadToEndAsync(ct);
            await proc.WaitForExitAsync(ct);
            if (proc.ExitCode != 0)
            {
                logger.LogError("ffmpeg concat failed (exit {Code}): {Err}", proc.ExitCode, stderr);
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ffmpeg invocation failed");
            return false;
        }
    }
}
