using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TextStack.Tts;

/// <summary>
/// Low-level client for Microsoft Edge's free TTS WebSocket API.
/// No external dependencies — uses System.Net.WebSockets.ClientWebSocket.
/// Protocol based on https://github.com/rany2/edge-tts
/// </summary>
internal static class EdgeTtsClient
{
    private const string TrustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private const string SecMsGecVersion = "1-143.0.3650.75";
    private const string ChromiumVersion = "143.0.3650.75";
    private const string WssBase = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
    private const string VoiceListUrl = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=" + TrustedClientToken;
    private const string OutputFormat = "audio-24khz-48kbitrate-mono-mp3";
    private const long WinEpoch = 11_644_473_600L;

    // Shared HttpClient — the anti-pattern of `new HttpClient()` per call
    // exhausts sockets under load (TIME_WAIT buildup). This endpoint is
    // currently called at most once per process (voice list cached), but
    // keeping the pattern correct prevents future regression.
    private static readonly HttpClient SharedHttp = new()
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    public static async Task<byte[]> SynthesizeAsync(string text, string voice, string rate, string volume, string pitch, string lang, CancellationToken ct, long maxAudioBytes = 5L * 1024 * 1024)
    {
        var connectionId = Guid.NewGuid().ToString("N");
        var secGec = GenerateSecMsGec();
        var muid = GenerateMuid();
        var url = $"{WssBase}?TrustedClientToken={TrustedClientToken}&Sec-MS-GEC={secGec}&Sec-MS-GEC-Version={SecMsGecVersion}&ConnectionId={connectionId}";

        using var ws = new ClientWebSocket();
        ws.Options.SetRequestHeader("Pragma", "no-cache");
        ws.Options.SetRequestHeader("Cache-Control", "no-cache");
        ws.Options.SetRequestHeader("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
        ws.Options.SetRequestHeader("Accept-Encoding", "gzip, deflate, br, zstd");
        ws.Options.SetRequestHeader("Accept-Language", "en-US,en;q=0.9");
        ws.Options.SetRequestHeader("User-Agent", $"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ChromiumVersion} Safari/537.36 Edg/{ChromiumVersion}");
        ws.Options.SetRequestHeader("Cookie", $"muid={muid};");

        await ws.ConnectAsync(new Uri(url), ct);

        // 1. Send config
        var configMessage =
            "Content-Type:application/json; charset=utf-8\r\n" +
            "Path:speech.config\r\n\r\n" +
            JsonSerializer.Serialize(new
            {
                context = new
                {
                    synthesis = new
                    {
                        audio = new
                        {
                            metadataoptions = new { sentenceBoundaryEnabled = "false", wordBoundaryEnabled = "true" },
                            outputFormat = OutputFormat
                        }
                    }
                }
            });
        await SendTextAsync(ws, configMessage, ct);

        // 2. Send SSML
        var requestId = Guid.NewGuid().ToString("N");
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        var escapedText = System.Security.SecurityElement.Escape(text);
        // Derive BCP-47 lang tag from the voice name (e.g. "uk-UA-PolinaNeural"
        // → "uk-UA"). Hardcoding en-US was semantically wrong for non-English
        // voices; engines generally respect <voice> but xml:lang affects
        // fallback processing and should match.
        var xmlLang = ResolveXmlLang(voice, lang);
        var escapedLang = System.Security.SecurityElement.Escape(xmlLang);
        var escapedVoice = System.Security.SecurityElement.Escape(voice);
        var ssml =
            $"X-RequestId:{requestId}\r\n" +
            "Content-Type:application/ssml+xml\r\n" +
            $"X-Timestamp:{timestamp}\r\n" +
            "Path:ssml\r\n\r\n" +
            $"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{escapedLang}'>" +
            $"<voice name='{escapedVoice}'><prosody pitch='{pitch}' rate='{rate}' volume='{volume}'>{escapedText}</prosody></voice></speak>";
        await SendTextAsync(ws, ssml, ct);

        // 3. Receive audio chunks
        using var audioStream = new MemoryStream();
        var buffer = new byte[8192];
        // Reuse one MemoryStream across messages — `using var msgStream = new
        // MemoryStream()` inside the loop allocated a fresh stream per WS
        // message (one per ~8KB chunk = many per response), churning the GC
        // under load. SetLength(0) inside the loop resets without freeing the
        // backing buffer, so subsequent writes hit the same array.
        using var msgStream = new MemoryStream();

        try
        {
            while (ws.State == WebSocketState.Open)
            {
                msgStream.SetLength(0);
                WebSocketReceiveResult result;
                do
                {
                    result = await ws.ReceiveAsync(buffer, ct);
                    msgStream.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Close)
                    break;

                if (result.MessageType == WebSocketMessageType.Binary)
                {
                    // Use GetBuffer() + length to avoid the ToArray() copy that
                    // each iteration would otherwise allocate.
                    var msgLen = (int)msgStream.Length;
                    var msgBuf = msgStream.GetBuffer();
                    if (msgLen > 2)
                    {
                        // First 2 bytes = header length (big-endian)
                        var headerLen = (msgBuf[0] << 8) | msgBuf[1];
                        var audioStart = headerLen + 2;
                        if (audioStart < msgLen)
                        {
                            var chunkLen = msgLen - audioStart;
                            // Hard cap — Bing should never exceed a few hundred KB for
                            // a 500-char input, so anything past maxAudioBytes is a
                            // protocol regression or attack. Bail before OOM.
                            if (audioStream.Length + chunkLen > maxAudioBytes)
                                throw new InvalidOperationException(
                                    $"TTS response exceeded {maxAudioBytes} bytes — aborting");
                            audioStream.Write(msgBuf, audioStart, chunkLen);
                        }
                    }
                }
                else if (result.MessageType == WebSocketMessageType.Text)
                {
                    var text_ = Encoding.UTF8.GetString(msgStream.GetBuffer(), 0, (int)msgStream.Length);
                    if (text_.Contains("Path:turn.end"))
                        break;
                }
            }
        }
        finally
        {
            // Always attempt a graceful close. Without it, an exception path
            // (size cap, cancellation, IO error) leaves Bing seeing an abrupt
            // TCP RST when the `using ws` finalizes — repeated unfriendly
            // disconnects can attract rate-limiting / IP blocks. Best-effort:
            // socket may already be in a bad state, so swallow close failures.
            // Use a short bounded timeout — don't let close hang on a dead peer.
            if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
            {
                try
                {
                    using var closeCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, closeCts.Token);
                }
                catch { /* best-effort */ }
            }
        }

        return audioStream.ToArray();
    }

    public static async Task<List<EdgeVoiceData>> GetVoicesAsync(CancellationToken ct)
    {
        // Headers per-request (not on SharedHttp.DefaultRequestHeaders) — shared
        // client is stateless; mutating defaults on a static client would race
        // across concurrent callers.
        using var req = new HttpRequestMessage(HttpMethod.Get, VoiceListUrl);
        req.Headers.Add("Authority", "speech.platform.bing.com");
        req.Headers.Add("Sec-CH-UA", $"\"Microsoft Edge\";v=\"{ChromiumVersion.Split('.')[0]}\", \"Chromium\";v=\"{ChromiumVersion.Split('.')[0]}\", \"Not?A_Brand\";v=\"99\"");
        req.Headers.Add("Accept", "application/json");
        req.Headers.Add("Sec-Fetch-Site", "none");
        req.Headers.Add("Sec-Fetch-Mode", "cors");
        req.Headers.Add("Sec-Fetch-Dest", "empty");
        req.Headers.Add("User-Agent", $"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ChromiumVersion} Safari/537.36 Edg/{ChromiumVersion}");

        using var res = await SharedHttp.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadAsStringAsync(ct);
        return JsonSerializer.Deserialize<List<EdgeVoiceData>>(json) ?? [];
    }

    private static async Task SendTextAsync(ClientWebSocket ws, string message, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(message);
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
    }

    private static string ResolveXmlLang(string voice, string lang)
    {
        // Voice names follow "xx-YY-Name…" — first two dash-segments form the
        // BCP-47 tag. Fall back to caller-provided lang (or en-US) if the
        // voice name is malformed.
        var parts = voice.Split('-');
        if (parts.Length >= 2 && parts[0].Length == 2 && parts[1].Length >= 2)
            return $"{parts[0]}-{parts[1]}";
        if (!string.IsNullOrWhiteSpace(lang)) return lang.Contains('-') ? lang : $"{lang.ToLowerInvariant()}-{lang.ToUpperInvariant()}";
        return "en-US";
    }

    private static string GenerateSecMsGec()
    {
        // Match edge-tts Python: unix_ts + WIN_EPOCH, round to 300s, multiply by 1e7
        var unixTs = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var ticks = unixTs + WinEpoch;
        ticks -= ticks % 300;
        ticks *= 10_000_000;
        var input = $"{ticks}{TrustedClientToken}";
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(input));
        return Convert.ToHexString(hash);
    }

    private static string GenerateMuid()
    {
        var bytes = new byte[16];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes);
    }
}

public class EdgeVoiceData
{
    public string Name { get; set; } = "";
    public string ShortName { get; set; } = "";
    public string Gender { get; set; } = "";
    public string Locale { get; set; } = "";
    public string FriendlyName { get; set; } = "";
    public string Status { get; set; } = "";
    public string SuggestedCodec { get; set; } = "";
}
