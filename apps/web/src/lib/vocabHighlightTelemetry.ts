// Lightweight counter API for vocab-highlight reliability signals.
// Console-only sink for slice 1 — analytics pipeline hookup later if needed.
// Guarantees: never throws, never blocks caller.

export type TelemetryEvent =
  | 'boot.supported'
  | 'boot.fallback'
  | 'register.success'
  | 'register.mismatch'
  | 'register.error'
  | 'clear.success'
  | 'clear.error'
  | 'mutation.recover'
  | 'overlay.reflow'
  | 'oracle.diff'
  | 'error.boundary'
  | 'error.engine'

export type TelemetryPayload = Record<string, unknown>

export type TelemetrySink = (event: TelemetryEvent, payload?: TelemetryPayload) => void

const PREFIX = '[VocabHighlight]'

const consoleSink: TelemetrySink = (event, payload) => {
  if (event.startsWith('error.') || event === 'oracle.diff' || event === 'register.mismatch') {
    console.warn(`${PREFIX} ${event}`, payload ?? {})
  } else if (typeof console.debug === 'function') {
    console.debug(`${PREFIX} ${event}`, payload ?? {})
  }
}

let sink: TelemetrySink = consoleSink

export function count(event: TelemetryEvent, payload?: TelemetryPayload): void {
  try {
    sink(event, payload)
  } catch {
    // Telemetry must never break the caller.
  }
}

export function setSink(next: TelemetrySink): void {
  sink = next
}

export function resetSink(): void {
  sink = consoleSink
}
