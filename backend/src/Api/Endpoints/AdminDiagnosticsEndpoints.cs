namespace Api.Endpoints;

/// <summary>
/// Admin-only smoke tests for the Sentry wiring. Admin auth is path-based
/// (Program.cs: UseWhen("/admin") → UseAdminAuth), so mapping under /admin is enough.
///
/// Two routes because there are two distinct paths into Sentry and both can break independently:
/// a direct <c>CaptureMessage</c>, and a thrown exception that only reaches Sentry via
/// ExceptionMiddleware's <c>logger.LogError</c> (it catches everything, so Sentry's own middleware
/// never sees it). With no DSN both are inert and the response says so — which is the no-op proof.
/// </summary>
public static class AdminDiagnosticsEndpoints
{
    public static void MapAdminDiagnosticsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/diagnostics").WithTags("Admin Diagnostics");

        group.MapPost("/sentry-test", (ILogger<Program> logger) =>
            {
                var eventId = SentrySdk.CaptureMessage(
                    "TextStack Sentry smoke test (admin-triggered).",
                    scope => scope.SetTag("ai.task", "diagnostics"),
                    SentryLevel.Error);

                var enabled = SentrySdk.IsEnabled;
                logger.LogInformation(
                    "Sentry test event {EventId} (enabled: {Enabled})", eventId, enabled);

                return Results.Ok(new SentryTestResponse(eventId.ToString(), enabled));
            })
            .WithName("SentryTest")
            .WithDescription("Captures a test message and returns the Sentry event id.");

        group.MapPost("/sentry-test-error", () =>
            {
                throw new SentrySmokeTestException(
                    "Deliberate admin-triggered exception to verify Sentry error capture.");
            })
            .WithName("SentryTestError")
            .WithDescription("Throws; verifies the ExceptionMiddleware → LogError → Sentry path.");
    }
}

public record SentryTestResponse(string EventId, bool Enabled);

/// <summary>Distinct type so the smoke test is trivially filterable in Sentry.</summary>
public sealed class SentrySmokeTestException(string message) : Exception(message);
