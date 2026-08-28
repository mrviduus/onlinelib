# QA Test Scenarios

Manual test scenarios for verifying reader functionality.

## Structure

```
docs/qa/
├── README.md           # This file
└── scenarios/          # Individual test scenarios
    └── *.md
```

## Running Tests

When asked to run a QA scenario:
1. Follow steps exactly as written
2. Verify each expected result
3. Document any deviations in "Actual Results"

## Instrumenting a defect for the next run

**Diagnostics meant for a device reproduction must not be behind `__DEV__`.**

A tester runs the Play build plus an OTA. `__DEV__` is false there — only the
`development` EAS profile sets `developmentClient`. A `console.log` added to
"make the next run report a fact" prints nothing in the only configuration the
next run will use.

This is written down because it happened: the language-onboarding defect was
reproduced three times, each time with logging in place that could not fire, so
three reproductions produced no evidence and two fixes were built on guesses.

Use `breadcrumb()` (`apps/mobile/src/lib/breadcrumb.ts`) instead — a Sentry
breadcrumb rides along with whatever the session reports, costs nothing when no
DSN is set, and is readable without a cable. Record the *inputs to the decision*
and the answer, not the flow: a breadcrumb per step is a trail nobody reads.

`__DEV__` stays right for warnings aimed at whoever is running the dev client.

## Scenario Format

Each scenario includes:
- **Preconditions**: Setup required before testing
- **Steps**: Actions to perform
- **Expected Results**: What should happen
- **Actual Issues**: Known bugs (updated after testing)

## Scenarios

| ID | Name | Area |
|----|------|------|
| QA-001 | [Reading Progress & Auto-Save](scenarios/QA-001-reading-progress.md) | Reader, Library |
| QA-002 | [Library Multilang Navigation](scenarios/QA-002-library-multilang-navigation.md) | Library, i18n |
| QA-003 | [SSG Rebuild Admin](scenarios/QA-003-ssg-rebuild.md) | Admin, SSG |
| QA-004 | [Bookmarks & Autosave](scenarios/QA-004-bookmarks-autosave.md) | Reader, Bookmarks |
