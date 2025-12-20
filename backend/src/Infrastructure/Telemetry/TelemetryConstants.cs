using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Reflection;

namespace Infrastructure.Telemetry;

public static class TelemetryConstants
{
    public static readonly string ServiceVersion =
        Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "1.0.0";

    public const string IngestionActivitySourceName = "OnlineLib.Ingestion";
    public const string ApiActivitySourceName = "OnlineLib.Api";
    public const string MeterName = "OnlineLib.Ingestion";
}

public static class IngestionActivitySource
{
    public static readonly ActivitySource Source = new(
        TelemetryConstants.IngestionActivitySourceName,
        TelemetryConstants.ServiceVersion);
}

public static class ApiActivitySource
{
    public static readonly ActivitySource Source = new(
        TelemetryConstants.ApiActivitySourceName,
        TelemetryConstants.ServiceVersion);
}

public static class IngestionMetrics
{
    private static readonly Meter Meter = new(
        TelemetryConstants.MeterName,
        TelemetryConstants.ServiceVersion);

    // Counters
    public static readonly Counter<long> JobsStarted = Meter.CreateCounter<long>(
        "ingestion_jobs_started_total",
        description: "Total ingestion jobs started");

    public static readonly Counter<long> JobsSucceeded = Meter.CreateCounter<long>(
        "ingestion_jobs_succeeded_total",
        description: "Total ingestion jobs succeeded");

    public static readonly Counter<long> JobsFailed = Meter.CreateCounter<long>(
        "ingestion_jobs_failed_total",
        description: "Total ingestion jobs failed");

    public static readonly Counter<long> OcrUsed = Meter.CreateCounter<long>(
        "extraction_ocr_used_total",
        description: "Total OCR extractions performed");

    // Histograms
    public static readonly Histogram<double> JobDuration = Meter.CreateHistogram<double>(
        "ingestion_job_duration_ms",
        unit: "ms",
        description: "Ingestion job duration in milliseconds");

    public static readonly Histogram<double> ExtractionDuration = Meter.CreateHistogram<double>(
        "extraction_duration_ms",
        unit: "ms",
        description: "Extraction duration in milliseconds");
}
