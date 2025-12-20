# Observability Stack

OpenTelemetry-based observability for OnlineLib.

## Stack Components

| Component       | Port  | URL                      |
|-----------------|-------|--------------------------|
| Grafana         | 3000  | http://localhost:3000    |
| Prometheus      | 9090  | http://localhost:9090    |
| Tempo           | 3200  | http://localhost:3200    |
| OTEL Collector  | 4317  | gRPC                     |
| OTEL Collector  | 4318  | HTTP                     |

## Quick Start

```bash
# Start full stack
docker compose up -d

# View Grafana dashboards
open http://localhost:3000
# Login: admin / admin

# View Prometheus metrics
open http://localhost:9090
```

## Dashboards

Pre-provisioned dashboards in Grafana:

1. **Ingestion Overview** - Jobs succeeded/failed, success rate, failure reasons, OCR usage
2. **Extraction Performance** - p50/p95 latencies by format, slow traces
3. **Worker Health** - Queue status, backlog, throughput

## Metrics

### Counters
- `onlinelib_ingestion_jobs_started_total{format}` - Jobs started
- `onlinelib_ingestion_jobs_succeeded_total{format}` - Jobs succeeded
- `onlinelib_ingestion_jobs_failed_total{format, reason}` - Jobs failed
- `onlinelib_extraction_ocr_used_total{format}` - OCR extractions

### Histograms
- `onlinelib_ingestion_job_duration_ms{format}` - Total job duration
- `onlinelib_extraction_duration_ms{format, text_source}` - Extraction duration

### Gauges
- `onlinelib_ingestion_jobs_in_progress` - Currently processing
- `onlinelib_ingestion_jobs_pending` - Waiting in queue
- `onlinelib_ingestion_queue_lag_ms` - Age of oldest pending job

## Traces

Traces are exported to Tempo. Key spans:

- `ingestion.job.pick` - Job selection from queue
- `ingestion.job.process` - Full job processing
- `ingestion.file.open` - File access
- `extraction.run` - Text extraction
- `persist.result` - Database persistence

### Viewing Traces

1. Open Grafana
2. Go to Explore → Tempo
3. Query: `{service.name="onlinelib-worker"}`
4. Or find slow traces: `{name="ingestion.job.process"} | duration > 10s`

## Alerts

Provisioned alerts in Grafana:

| Alert                        | Condition                    | Severity |
|------------------------------|------------------------------|----------|
| High Ingestion Failure Rate  | failure_rate > 5% for 15m    | Warning  |
| Critical Failure Rate        | failure_rate > 10% for 15m   | Critical |
| High Extraction Latency      | p95 > 60s for 15m            | Warning  |
| Backlog Growing              | pending > 100 for 30m        | Warning  |
| Queue Stale                  | lag > 1h for 30m             | Critical |
| OCR Spike                    | OCR > 50% of jobs for 15m    | Info     |

## Configuration

### Enable OTLP Export

Set environment variable:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

Already configured in docker-compose for API and Worker.

### Local Development (without collector)

If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, telemetry exports to console.

## Adding New Metrics

1. Edit `backend/src/Infrastructure/Telemetry/TelemetryConstants.cs`
2. Add new Counter/Histogram/Gauge to `IngestionMetrics`
3. Record metric in relevant code path
4. Update dashboards in `observability/grafana/dashboards/`

## Adding New Spans

```csharp
using Infrastructure.Telemetry;

using var activity = IngestionActivitySource.Source.StartActivity("my.span.name");
activity?.SetTag("key", "value");
// ... do work
activity?.SetStatus(ActivityStatusCode.Ok);
```

## Verifying Signals

1. Start stack: `docker compose up -d`
2. Upload a test file via admin API
3. Check Prometheus: `http://localhost:9090/graph`
   - Query: `onlinelib_ingestion_jobs_started_total`
4. Check Grafana dashboards
5. Check Tempo for traces

## Troubleshooting

### No metrics in Prometheus
- Check OTEL collector logs: `docker logs books_otel`
- Verify API/Worker logs show OTLP export

### No traces in Tempo
- Check Tempo logs: `docker logs books_tempo`
- Verify collector config exports to `otlp/tempo`

### Dashboards not loading
- Check Grafana logs: `docker logs books_grafana`
- Verify provisioning paths in docker-compose volumes
