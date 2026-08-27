# Mobile e2e — what this lane is, and what it is not

Playwright driving the **Expo web build** in a phone-sized viewport. It exercises
routing, screen composition and empty states. It exercises **no native code**:
not the reader WebView's gestures, not SQLite, not keep-awake, not offline mode.
Anything that needs the device belongs in Lane B (Maestro) — see
[`../../../docs/qa/MOBILE-TEST-PLAN.md`](../../../docs/qa/MOBILE-TEST-PLAN.md).

## State

**Not run by CI, and not yet worth running.** These specs need a live backend, so
they cannot gate a pull request. Making them hermetic — request interception
installed before navigation, fixtures per route — is Lane A of the test plan and
has not been done.

What *was* done, on 2026-08-27, is making them stop lying:

| | before | after |
|---|---|---|
| tests | 22 | 17 |
| assertions that cannot fail | 34 | 0 |

Five tests were deleted. Three contained no `expect` at all — they clicked
things and ended. Two hid their only assertion inside an `if`, so the case they
existed to catch passed silently, and they could not be repaired here because the
rows they check only exist for a signed-in reader. Six self-skips on conditions
indistinguishable from a broken screen became one, for the only precondition this
lane genuinely cannot control: a deployment whose catalog is empty.

The shape to never write again:

```ts
// Cannot fail. The catch swallows the timeout, and the matcher then asserts a
// boolean this line produced two expressions ago.
expect(await page.locator('…').isVisible().catch(() => false)).toBeTruthy()
```

```ts
// Can fail, and says why in the trace.
await expect(page.locator('…')).toBeVisible()
```

This matters more than the count. A suite in this shape was green for the whole
week the Library screen was unusable, and green again through the manual pass
that found 24 defects. Fewer tests that can fail beat more that cannot.

## Running

```bash
cd apps/mobile
npx expo start --web          # or point PLAYWRIGHT_BASE_URL at a running build
npx playwright test --config e2e/playwright.config.ts
```

Signed out by default. Assertions that would differ for a signed-in reader accept
the sign-in branch explicitly rather than assuming one.
