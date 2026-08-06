using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Telemetry;

/// <summary>
/// Worker-host wiring for Sentry. The generic host has no request pipeline, so Sentry rides the
/// logging provider: <c>logger.LogError(ex, …)</c> becomes an event.
///
/// No-op when no DSN is configured — we don't call into the SDK at all rather than initialising it
/// with an empty DSN, so a local dev run, a CI run and a fork behave exactly as before this feature.
/// (The API host's equivalent lives next to its other observability wiring, in
/// <c>Api/Extensions/ServiceCollectionExtensions.Hosting.cs</c>, because it needs ASP.NET types.)
/// </summary>
public static class SentryExtensions
{
    public static ILoggingBuilder AddTextStackSentry(
        this ILoggingBuilder logging, IConfiguration configuration, string environmentName)
    {
        var settings = SentryBootstrap.Resolve(configuration, environmentName);
        if (settings is null)
            return logging;

        logging.AddSentry(options =>
        {
            settings.Apply(options);
            options.MinimumEventLevel = LogLevel.Error;
        });

        return logging;
    }
}
