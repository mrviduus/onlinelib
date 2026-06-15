using System.Text.Json;

namespace Contracts.Agents;

/// <summary>Request to run the Study Buddy agent on a highlighted passage (Phase 6, AI-037).</summary>
public record StudyBuddyRequest(string Passage, int? ChapterNumber);

/// <summary>
/// A persisted Study Buddy run for the "show steps" view (<c>GET /me/studybuddy/runs/{id}</c>).
/// <see cref="Steps"/> is the transcript parsed from the stored jsonb.
/// </summary>
public record StudyBuddyRunDto(
    Guid Id,
    string Agent,
    string Status,
    string? Output,
    JsonElement Steps,
    int Iterations,
    decimal CostUsd,
    int LatencyMs,
    string? Error,
    DateTimeOffset CreatedAt);
