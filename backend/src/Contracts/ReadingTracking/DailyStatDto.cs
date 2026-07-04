namespace Contracts.ReadingTracking;

// Daily reading stats bucket (R5 slice-2). Moved verbatim from Api.Endpoints so the
// GetDailyStats projection lives beside the service that produces it. Field names/casing unchanged.
public record DailyStatDto(DateTime Date, int TotalSeconds, int TotalWords, int SessionCount);
