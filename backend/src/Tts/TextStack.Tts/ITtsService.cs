namespace TextStack.Tts;

public interface ITtsService
{
    Task<byte[]> SynthesizeAsync(string text, string lang, string? voice = null, double speed = 1.0, CancellationToken ct = default);
    Task<IReadOnlyList<TtsVoiceInfo>> GetVoicesAsync(string? lang = null, CancellationToken ct = default);
}

public record TtsVoiceInfo(string Name, string ShortName, string Gender, string Locale, string Language);
