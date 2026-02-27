namespace TextStack.Tts;

public class TtsConfiguration
{
    public string CachePath { get; set; } = "data/tts-cache";
    public int MaxTextLength { get; set; } = 500;
    public int TimeoutSeconds { get; set; } = 15;
    public long MaxCacheSizeBytes { get; set; } = 1L * 1024 * 1024 * 1024; // 1GB
    public int CacheTtlDays { get; set; } = 30;

    public Dictionary<string, string> DefaultVoices { get; set; } = new()
    {
        ["en"] = "en-US-AriaNeural",
        ["uk"] = "uk-UA-PolinaNeural"
    };
}
