namespace Contracts.ReadingTracking;

// Submit-reading-session request/response (R5 slice-4). Moved verbatim from Api.Endpoints so they
// live beside the ReadingSessionService that consumes/produces them. Field names/casing/order
// unchanged — the wire contract for POST /me/reading/sessions is byte-identical.
public record SubmitSessionRequest(
    Guid? EditionId,
    Guid? UserBookId,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    int DurationSeconds,
    int WordsRead,
    double StartPercent,
    double EndPercent
);

public record SubmitSessionResponse(Guid SessionId, List<string> NewAchievements);
