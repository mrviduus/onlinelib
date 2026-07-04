using Infrastructure.Telemetry;
using Microsoft.AspNetCore.Http.Features;
using OpenTelemetry.Trace;

namespace Api.Extensions;

/// <summary>
/// DI + host-configuration extension methods extracted from Program.cs (refactor R2).
/// Purely behavior-preserving: same registrations, same lifetimes, same order where it
/// matters — grouped by concern so Program.cs reads like a table of contents.
///
/// Split across partial files by concern:
///   - .Hosting.cs        upload limits, OpenTelemetry/logging
///   - .Cors.cs           CORS default policy
///   - .Ai.cs             AI eval runners, agents, tools, crews
///   - .Persistence.cs    ICurrentSite, DbContext, file storage
///   - .Search.cs         search providers, similar/hybrid catalog, reindex
///   - .Rag.cs            RAG retrieval, chunking, context/ask services
///   - .Content.cs        vocabulary, images, sites, user books, email, TTS
///   - .HostedServices.cs background workers
///   - .RateLimiting.cs   rate-limiter policies
/// </summary>
public static partial class ServiceCollectionExtensions
{
    // Match nginx client_max_body_size (500MB) + per-user storage quota.
    // Default Kestrel cap is 30MB → users hit 413 on real-world PDFs.
    private const long MaxUploadBytes = 500L * 1024 * 1024;

    /// <summary>Kestrel + multipart body limits sized to match nginx (500MB).</summary>
    public static WebApplicationBuilder AddTextStackUploadLimits(this WebApplicationBuilder builder)
    {
        builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxUploadBytes);
        builder.Services.Configure<FormOptions>(o =>
        {
            o.MultipartBodyLengthLimit = MaxUploadBytes;
            o.ValueLengthLimit = int.MaxValue;
            o.MultipartHeadersLengthLimit = int.MaxValue;
        });
        return builder;
    }

    /// <summary>OpenTelemetry tracing/metrics + telemetry logging for the API host.</summary>
    public static WebApplicationBuilder AddTextStackObservability(this WebApplicationBuilder builder)
    {
        builder.Services.AddTextStackTelemetry(
            builder.Configuration,
            "textstack-api",
            tracing => tracing
                .AddAspNetCoreInstrumentation(options =>
                {
                    options.RecordException = true;
                    options.EnrichWithHttpRequest = (activity, request) =>
                    {
                        activity.SetTag("http.client_ip", request.HttpContext.Connection.RemoteIpAddress?.ToString());
                    };
                })
                .AddHttpClientInstrumentation());
        builder.Logging.AddTelemetryLogging(builder.Configuration, "textstack-api");
        return builder;
    }
}
