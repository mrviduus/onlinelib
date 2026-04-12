import type { Page } from '@playwright/test'

// Simulate a vertical swipe on a target selector by dispatching synthetic
// touchstart/touchend events at computed points. Works headless — no device
// emulation or touchscreen fixture needed.
async function dispatchSwipe(page: Page, selector: string, dy: number) {
  await page.evaluate(
    ({ sel, dy }) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) throw new Error(`swipe target not found: ${sel}`)
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const endY = startY + dy
      // Use real Touch constructor (Chromium supports it); fall back to
      // plain object cast when unavailable (Firefox).
      const mkTouch = (y: number): Touch => {
        const TouchCtor = (window as unknown as { Touch?: typeof Touch }).Touch
        if (TouchCtor) {
          return new TouchCtor({
            identifier: 0, target: el,
            clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y,
            radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1,
          })
        }
        return { identifier: 0, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y } as unknown as Touch
      }
      const start = new TouchEvent('touchstart', {
        bubbles: true, cancelable: true,
        touches: [mkTouch(startY)], targetTouches: [mkTouch(startY)], changedTouches: [mkTouch(startY)],
      })
      const end = new TouchEvent('touchend', {
        bubbles: true, cancelable: true,
        touches: [], targetTouches: [], changedTouches: [mkTouch(endY)],
      })
      document.dispatchEvent(start)
      document.dispatchEvent(end)
    },
    { sel: selector, dy },
  )
}

export async function swipeUp(page: Page, selector = '.focus-reader') {
  await dispatchSwipe(page, selector, -120)
}

export async function swipeDown(page: Page, selector = '.focus-reader') {
  await dispatchSwipe(page, selector, 120)
}
