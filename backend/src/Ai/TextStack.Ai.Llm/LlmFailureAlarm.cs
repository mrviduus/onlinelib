namespace TextStack.Ai.Llm;

/// <summary>
/// Provider-level failure reporting, tagged with the task and provider so a Sentry issue answers
/// "which feature, on which model, is broken?" without opening a trace.
///
/// Static (not DI) on purpose: the two call sites that need it — <see cref="TracingDecorator"/> and
/// <see cref="OllamaLlmClient"/> — are constructed by hand in keyed DI factories, and threading an
/// extra dependency through both would churn every existing unit-test construction for no gain.
/// Against a disabled hub (no DSN) every call here is already a no-op.
/// </summary>
public static class LlmFailureAlarm
{
    public const string ReasonException = "exception";
    public const string ReasonHttpStatus = "http_status";
    public const string ReasonTimeout = "timeout";
    public const string ReasonTransport = "transport";

    private static AlarmThrottle _throttle = new(TimeSpan.FromMinutes(60));

    /// <summary>Sets the shared cooldown from <c>Ai:RouteAlarm:CooldownMinutes</c> at startup.</summary>
    public static void Configure(TimeSpan cooldown) => _throttle = new AlarmThrottle(cooldown);

    /// <summary>
    /// Reports one provider failure, throttled per (provider, task, reason). A dead Ollama during a
    /// 106-page PDF parse produces one event, not 106.
    /// </summary>
    public static void Capture(string provider, string? featureTag, string reason, Exception? ex = null)
    {
        var task = string.IsNullOrWhiteSpace(featureTag) ? "unknown" : featureTag;
        if (!_throttle.TryEnter($"llm|{provider}|{task}|{reason}", DateTimeOffset.UtcNow))
            return;

        try
        {
            void Enrich(Scope scope)
            {
                scope.SetTag("ai.provider", provider);
                scope.SetTag("ai.task", task);
                scope.SetTag("ai.failure", reason);
            }

            if (ex is not null)
                SentrySdk.CaptureException(ex, Enrich);
            else
                SentrySdk.CaptureMessage(
                    $"LLM provider '{provider}' failed for task '{task}' ({reason}).",
                    Enrich,
                    SentryLevel.Warning);
        }
        catch
        {
            // Reporting a failure must never cause one.
        }
    }
}
