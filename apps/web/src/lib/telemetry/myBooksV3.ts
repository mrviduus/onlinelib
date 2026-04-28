type Params = Record<string, string | number | boolean | undefined | null>

const isBrowser = typeof window !== 'undefined'
const isDev =
  typeof import.meta !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.DEV === true

export type MyBooksV3Event =
  | 'header.click'
  | 'header.search.opened'
  | 'home.landed'
  | 'library.shelf.view'
  | 'library.shelf.click'
  | 'library.shelf.viewAll'

export function emit(event: MyBooksV3Event, params?: Params): void {
  try {
    const payload = { ...(params ?? {}), ts: Date.now() }
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug('[myBooksV3]', event, payload)
    }
    if (!isBrowser) return
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof gtag === 'function') {
      gtag('event', event.replace('.', '_'), payload)
    }
  } catch {
    // never break app for telemetry
  }
}
