---
title: "Why I relicensed TextStack from BUSL-1.1 to AGPL-3.0"
date: 2026-05-04
tags: [textstack, open-source, licensing, indie-dev]
canonical_url: https://vasyl.blog/2026/05/04/why-i-relicensed-textstack-from-busl-to-agpl/
---

# Why I relicensed TextStack from BUSL-1.1 to AGPL-3.0

I picked BUSL-1.1 for [TextStack](https://textstack.app) three weeks ago.
Three weeks later I changed my mind. Here's the reasoning, for any solo
dev about to make the same call.

## The original choice

When I open-sourced TextStack, I copied the license file from a project I
admired. That project was on Business Source License 1.1. So mine became
BUSL-1.1.

I did vaguely understand what BUSL was: source-available, not OSI-approved.
You can read the code, fork it, run it for yourself — you just can't host
it as a commercial service competing with the licensor. The license
auto-converts to a real open-source license (Apache-2.0 in my case) after
four years.

The mental model was clear: *I'm protecting my future ability to
monetize. If TextStack ever takes off, I don't want AWS to fork it and
host a clone for $5/month, undercutting my path to one paying customer.*

That's a reasonable concern. The pattern that motivated companies like
MongoDB, Sentry, MariaDB, CockroachDB, and Elastic to move to BUSL or
SSPL is real: a hyperscaler can take your open-source code, productize
it, and outscale you on infra costs.

So why did I change my mind?

## The cost I didn't price in

The week I shipped TextStack, I tried to submit it to
[awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted).
It got rejected. The list is FOSS-only. BUSL doesn't qualify.

OK, fine — I went looking for the non-free fork. Submitted there instead.
Then I started preparing other awesome-list submissions: awesome-dotnet,
awesome-react-native, etc. Most of them either explicitly require an
OSI-approved license, or implicitly do (the maintainers don't want
non-FOSS clutter).

Then I noticed a pattern in the issues and discussions on TextStack's
GitHub repo: people would peek at the license badge, see "BUSL-1.1", and
tab away. Nobody opened an issue saying "I'd contribute but don't like
the license." Of course they didn't. They just didn't show up.

The brand cost is harder to measure but real: "source-available" reads
as "trying to have it both ways" to anyone steeped in OSS culture.
Whether that's fair is beside the point. It's the perception.

I started adding it up:

- Locked out of the most-trafficked self-hosted directory
- Awkward conversations every time I introduced the project ("wait,
  it's not actually open source?")
- Contributor friction (CLAs aside, devs avoid licenses they don't
  recognize)
- Branding "source-available" in a market where competitors say
  "open-source" — even when the practical difference for self-hosters
  is zero

Versus what I was protecting: a hyperscaler taking my niche reading tool
for developers learning AI engineering and hosting a $5/month clone.

That scenario is approximately fictional. AWS isn't building "AWS Book
Reader" any time soon. The realistic risk is closer to zero, and I was
paying real costs every day to insure against it.

## What about AGPL?

The third option I'd been ignoring: **GNU Affero General Public License
v3.0**.

AGPL is OSI-approved open source. It also has a copyleft clause — §13 —
that says: if you modify the software and run it as a network service,
you must publish your modifications under the same license. That's the
"AWS hosts a clone" defense, expressed through copyleft instead of
through licensing restrictions.

It's strictly weaker than BUSL against a determined competitor — they
could fork TextStack, modify it, publish their fork, and host that. But
the friction is high enough that nobody bothers for projects below a
certain size. And the "publish your fork" requirement makes it hard for
a closed-source SaaS to compete: their differentiator becomes public.

Look at who uses AGPL successfully:
- **[Plausible Analytics](https://plausible.io)** — competes with
  Google Analytics, profitable, AGPL-3.0
- **[PostHog](https://posthog.com)** — $100M+ revenue, AGPL-3.0
- **[Cal.com](https://cal.com)** — competes with Calendly, AGPL-3.0
- **[Mastodon](https://joinmastodon.org)** — federated social,
  AGPL-3.0
- **[Pixelfed](https://pixelfed.org)** — federated photos, AGPL-3.0
- **[Nextcloud](https://nextcloud.com)** — self-hosted file sync,
  AGPL-3.0
- **[Bitwarden](https://bitwarden.com)** — password manager (until
  acquisition), AGPL-3.0

These aren't fringe projects. They're successful indie SaaS companies
that monetize via hosted offerings while keeping the source open. The
business model: AGPL for the community, dual-license for commercial
customers who can't or won't comply with AGPL §13.

That's the model I want.

## What changed in TextStack

- `LICENSE`: BUSL-1.1 → AGPL-3.0
- README badge updated
- COPYRIGHT.md rewritten as plain-English summary of AGPL rights
- CONTRIBUTING.md gained a small CLA: contributions are AGPL-3.0, but
  contributors grant me the right to relicense their commits for the
  purpose of dual licensing. This preserves the ability to offer
  commercial terms even after others contribute.

Old commits stay BUSL-1.1 (a license can't be revoked retroactively).
Everything from `v0.1.0` onwards is AGPL-3.0.

The
[commit](https://github.com/mrviduus/textstack/commit/main) is one
chore: relicense, no functional changes.

## The dual-licensing payoff

Here's the second-order benefit I didn't appreciate when I picked BUSL:

With AGPL-3.0, if a company wants to embed TextStack in proprietary
software, or run it as a hosted commercial service without publishing
their modifications, they can buy a commercial license from me.

With BUSL-1.1, that path was already closed. BUSL is itself the
commercial-restricted license. There's no "upgrade to non-restricted"
to sell.

So AGPL gives me **both** the community license **and** the monetization
path. BUSL gave me only one.

I don't have any commercial customers yet. My
[goal](https://github.com/mrviduus/textstack#roadmap-6-month) is one by
October. AGPL keeps that door open in a way BUSL didn't.

## What I'd tell other solo devs

If you're picking a license for a solo project that has any chance of
becoming a commercial product:

1. **Don't copy BUSL because Sentry uses BUSL.** They have different
   threat models. A 100-person SaaS with $50M ARR has hyperscaler
   competition risk. You don't.
2. **Default to AGPL-3.0** unless you have a specific reason not to.
   It's the modern indie-SaaS license: real open source, strong
   copyleft, dual-licensable.
3. **MIT/Apache** are great for libraries and dev tools. They're poor
   for products you might want to monetize, because they don't
   protect against the "AWS forks and hosts" scenario at all.
4. **The license matters less than the trust you build around your
   project.** Don't agonize over edge cases. Pick a real OSI license,
   ship, and build.

## What's next for TextStack

- First v0.1.0 release tagged today, [available on
  GitHub](https://github.com/mrviduus/textstack/releases/tag/v0.1.0)
- Awesome-selfhosted submission planned for September (their
  4-month-since-first-release rule)
- iOS App Store launch
- Curated AI-engineering corpus: DDIA, ML papers, type theory,
  distributed systems classics

If TextStack might solve a problem for you — opening a textbook,
hitting a wall of unfamiliar terms, putting it down again — give it a
try at [textstack.app](https://textstack.app). No signup needed for
sample chapters.

If you're a fellow solo dev wrestling with the licensing question, my
[email](mailto:mrviduus@gmail.com) is open.

— Vasyl

---

*Find me on [GitHub](https://github.com/mrviduus) /
[Twitter](https://twitter.com/Rexetdeus) / [Dev.to](https://dev.to/mrviduus).
TextStack is at [textstack.app](https://textstack.app).*
