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

    public static async Task<byte[]> SynthesizeAsync(string text, string voice, string rate, string volume, string pitch, CancellationToken ct)
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
        var ssml =
            $"X-RequestId:{requestId}\r\n" +
            "Content-Type:application/ssml+xml\r\n" +
            $"X-Timestamp:{timestamp}\r\n" +
            "Path:ssml\r\n\r\n" +
            $"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
            $"<voice name='{voice}'><prosody pitch='{pitch}' rate='{rate}' volume='{volume}'>{escapedText}</prosody></voice></speak>";
        await SendTextAsync(ws, ssml, ct);

        // 3. Receive audio chunks
        using var audioStream = new MemoryStream();
        var buffer = new byte[8192];

        while (ws.State == WebSocketState.Open)
        {
            using var msgStream = new MemoryStream();
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
                var data = msgStream.ToArray();
                if (data.Length > 2)
                {
                    // First 2 bytes = header length (big-endian)
                    var headerLen = (data[0] << 8) | data[1];
                    var audioStart = headerLen + 2;
                    if (audioStart < data.Length)
                        audioStream.Write(data, audioStart, data.Length - audioStart);
                }
            }
            else if (result.MessageType == WebSocketMessageType.Text)
            {
                var text_ = Encoding.UTF8.GetString(msgStream.ToArray());
                if (text_.Contains("Path:turn.end"))
                    break;
            }
        }

        if (ws.State == WebSocketState.Open)
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);

        return audioStream.ToArray();
    }

    public static async Task<List<EdgeVoiceData>> GetVoicesAsync(CancellationToken ct)
    {
        using var http = new HttpClient();
        http.DefaultRequestHeaders.Add("Authority", "speech.platform.bing.com");
        http.DefaultRequestHeaders.Add("Sec-CH-UA", $"\"Microsoft Edge\";v=\"{ChromiumVersion.Split('.')[0]}\", \"Chromium\";v=\"{ChromiumVersion.Split('.')[0]}\", \"Not?A_Brand\";v=\"99\"");
        http.DefaultRequestHeaders.Add("Accept", "application/json");
        http.DefaultRequestHeaders.Add("Sec-Fetch-Site", "none");
        http.DefaultRequestHeaders.Add("Sec-Fetch-Mode", "cors");
        http.DefaultRequestHeaders.Add("Sec-Fetch-Dest", "empty");
        http.DefaultRequestHeaders.Add("User-Agent", $"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ChromiumVersion} Safari/537.36 Edg/{ChromiumVersion}");

        var json = await http.GetStringAsync(VoiceListUrl, ct);
        return JsonSerializer.Deserialize<List<EdgeVoiceData>>(json) ?? [];
    }

    private static async Task SendTextAsync(ClientWebSocket ws, string message, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(message);
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
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
