namespace TextStack.Tts;

public class TtsConfiguration
{
    public string CachePath { get; set; } = "data/tts-cache";
    public int MaxTextLength { get; set; } = 500;
    public int TimeoutSeconds { get; set; } = 15;
    public long MaxCacheSizeBytes { get; set; } = 1L * 1024 * 1024 * 1024; // 1GB
    public int CacheTtlDays { get; set; } = 30;
    // Concurrency cap across the process. Previously hardcoded to 3 — under
    // burst load (e.g. multiple users streaming TTS at once) that throttled
    // unnecessarily. Expose so ops can tune per-host.
    public int MaxConcurrentSynths { get; set; } = 6;
    public int ResponseCacheSeconds { get; set; } = 86400; // 1 day
    // Hard ceiling on a single synthesis response. MaxTextLength caps input at
    // 500 chars; at 24kHz/48kbps mono mp3 that's ~30s of audio ≈ 200KB. 5MB is
    // a generous safety net — if Bing ever streams unbounded data (bug, attack,
    // protocol change) we abort instead of OOM-ing the process.
    public long MaxAudioBytes { get; set; } = 5L * 1024 * 1024;
    // Bounded wait during graceful shutdown for an in-flight cache sweep to
    // finish. On a slow disk + large cache the sweep can legitimately take
    // 10s+; on a healthy host it returns in <100ms. 5s is a reasonable
    // default — bumpable via config for slow mounts (NFS/EFS).
    public int ShutdownSweepWaitSeconds { get; set; } = 5;

    public Dictionary<string, string> DefaultVoices { get; set; } = new()
    {
        // Broader coverage so non-English books don't fall back to an English
        // voice speaking foreign text (worst-quality degradation).
        ["en"] = "en-US-AriaNeural",
        ["uk"] = "uk-UA-PolinaNeural",
        ["ru"] = "ru-RU-SvetlanaNeural",
        ["es"] = "es-ES-ElviraNeural",
        ["fr"] = "fr-FR-DeniseNeural",
        ["de"] = "de-DE-KatjaNeural",
        ["it"] = "it-IT-ElsaNeural",
        ["pt"] = "pt-BR-FranciscaNeural",
        ["pl"] = "pl-PL-AgnieszkaNeural",
        ["nl"] = "nl-NL-ColetteNeural",
        ["tr"] = "tr-TR-EmelNeural",
        ["ja"] = "ja-JP-NanamiNeural",
        ["ko"] = "ko-KR-SunHiNeural",
        ["zh"] = "zh-CN-XiaoxiaoNeural",
        ["ar"] = "ar-SA-ZariyahNeural",
        ["hi"] = "hi-IN-SwaraNeural",
        ["cs"] = "cs-CZ-VlastaNeural",
        ["sk"] = "sk-SK-ViktoriaNeural",
        ["ro"] = "ro-RO-AlinaNeural",
        ["hu"] = "hu-HU-NoemiNeural",
        ["sv"] = "sv-SE-SofieNeural",
        ["no"] = "nb-NO-PernilleNeural",
        ["da"] = "da-DK-ChristelNeural",
        ["fi"] = "fi-FI-NooraNeural",
        ["el"] = "el-GR-AthinaNeural",
        ["he"] = "he-IL-HilaNeural",
        ["id"] = "id-ID-GadisNeural",
        ["vi"] = "vi-VN-HoaiMyNeural",
        ["th"] = "th-TH-PremwadeeNeural",
        ["bg"] = "bg-BG-KalinaNeural",
        ["hr"] = "hr-HR-GabrijelaNeural",
        ["sr"] = "sr-RS-SophieNeural",
        ["lt"] = "lt-LT-OnaNeural",
        ["lv"] = "lv-LV-EveritaNeural",
        ["et"] = "et-EE-AnuNeural",
        ["sl"] = "sl-SI-PetraNeural",
        ["ca"] = "ca-ES-JoanaNeural"
    };
}
