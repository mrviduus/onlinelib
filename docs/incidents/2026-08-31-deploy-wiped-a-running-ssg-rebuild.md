# A deploy wiped the SSG build that was running, and the build promoted the remains over the good tree

**Date:** 2026-08-31
**Status:** Resolved

## Impact

Every page on textstack.app returned **404 to crawlers** for roughly 50 minutes — not one section,
the whole site including the homepage:

```
/en/                     Googlebot=404
/en/books/dracula/       Googlebot=404
/en/authors/a-a-milne/   Googlebot=404
```

Browsers were unaffected throughout; nginx serves them the SPA. On disk `dist/ssg/en` held 104 author
pages, 23 genres and **zero books**, where a healthy tree holds ~1990 pages.

Self-inflicted, in the course of fixing the author-indexability incident earlier the same day
([2026-08-31-authors-404-to-crawlers-only](2026-08-31-authors-404-to-crawlers-only.md)). I queued a
full SSG rebuild, then merged an unrelated PR while it was still running.

## Root cause

Three defects lined up, and none of them is the merge.

**The deploy's protection has a hole.** `deploy.yml` already knows vite wipes `apps/web/dist`, and
snapshots `dist/ssg` out to `.ssg-staging` before the build, restoring it after — the step is titled
"Snapshot SSG dir + referenced assets before vite wipes dist" and it works. It snapshots the *live*
tree. A rebuild in flight is writing to `dist/ssg-new`, which is not snapshotted, so vite deleted it
mid-render.

**The worker trusted an exit code over the disk.** `ssg-worker.mjs` ran `atomicSwap()` whenever
prerender exited 0. Prerender did exit 0 — it had rendered 1990 of 1992 routes successfully, and its
report was accurate at the moment it was written. By the time the swap ran, most of those files no
longer existed. The swap moved the 127 survivors over the good tree the deploy had just restored.

**The deploy could not see the result.** "Wait for SSG rebuild to complete" polls for a sentinel file
with a 10-minute deadline, and on timeout runs `exit 0`. A real rebuild of ~2000 routes takes ~25
minutes, so that deadline expired on every honest rebuild and the step reported success either way —
"SSG never refreshed" and "SSG refreshed fine" were indistinguishable. Then "Validate SSG content"
checked that every file on disk has a real `<h1>`, which all 127 survivors did. It never asked how
many files there should be.

## Fix

**The worker refuses to promote a build that lost itself** (this PR). Before the swap it counts
`index.html` files under `ssg-new` and requires at least 90% of the route count. The floor is loose
on purpose — pages that render noindex are legitimately skipped — because it is not trying to catch a
few missing pages; it is there for the case that is not subtle. Today: 127 against a floor of 1792.
The check throws, which lands in the existing catch, which calls `cleanupFailedBuild()` and marks the
job Failed, leaving `dist/ssg` untouched. Had it existed, the site would never have gone down and the
job would have been visibly red.

**The deploy stops reporting success it did not verify.** The wait budget goes 10 min → 40 min, and a
timeout now fails the step instead of passing it. Validation gains a coverage floor: pages on disk
against the route list from `/ssg/routes`, same 90%, printing the surviving sections when it trips.

This closes the **class** for "the tree is gone" — three independent places now have to fail silently
together. It does **not** make deploys and rebuilds mutually exclusive; a rebuild overlapping a deploy
still wastes ~25 minutes of rendering and now ends in a failed job rather than a broken site. A real
lock is the follow-up, and it is worth doing because the periodic rebuild is admin-configurable and
will eventually collide with a deploy on its own, with nobody watching.

## Lesson

**A process that reports what it did is not reporting what survived.** Prerender's "1990/1992
rendered" was true and useless: it described an intention that something else had already undone. Any
producer that hands work to a later step across a filesystem should re-measure at the handoff, not
carry forward the number it computed at the start.

The second lesson is about timeouts that pass. A deadline that expires on every normal run, wired to
`exit 0`, is worse than no check: it is a green light that means nothing, and it trains everyone to
read the deploy as healthy. If a wait cannot be given a budget it will actually meet, it should not
be reported as a check.

## Detection

Immediately, but by luck rather than by design. I was verifying whether the author pages from the
earlier fix had come back and requested the homepage with a Googlebot user agent out of habit — it
returned 404. Nothing alerted: the deploy had gone green, `health-check.yml` was green because it
requests with a default user agent and gets the SPA, and the SSG job was marked Completed.

The alarm that would have caught it now exists twice over: the coverage floor fails the deploy, and
the author-crawlability probe added the same day (see the other incident) requests pages as a crawler
every five minutes and would have failed within minutes of the swap.

---

## Full write-up

The misleading evidence was the worker log, which reads like success end to end: `1990 rendered, 2
failed`, then `Atomic swap completed`, then `Job … completed successfully`. Both failures were books
with a noindex meta, which is expected and documented. Nothing in that log is wrong, and nothing in
it hints that the directory it was describing had been emptied.

The first wrong turn was looking for the files in the wrong place. `ls /app/dist/ssg/en/authors`
inside the worker showed 104, and `books=0` — which looked like a container/volume mismatch, since
`/en/books/dracula/` was still serving from SSG at that moment. It was not a mismatch:
`docker inspect` confirmed `apps/web/dist → /app/dist`, one directory. Dracula was still working
because the deploy had restored the snapshot and my rebuild had not yet swapped. The 404s arrived a
few minutes later, when it did.

Worth recording that the nginx config contains a dead alias: `location /ssg/` points at
`data/ssg/`, a directory that does not exist on the server. Serving works through the `root` at
`apps/web/dist` instead. It cost some minutes and it is still there.
