---
title: "Publishing an Expo App to Google Play in 2026: Four Gates Nobody Warned Me About"
slug: expo-google-play-android-developer-verification-2026
date: 2026-05-14
tags: [expo, react-native, android, google-play, eas-build]
status: draft
description: >
  Android Developer Verification, package-name pre-registration, a token-file
  marathon, and an Expo config plugin to survive prebuild. The pieces every
  outdated tutorial leaves out — written the night I finally got TextStack
  into Internal Testing.
---

> **TL;DR**
>
> Publishing a first Expo Android app to Google Play in 2026 is no longer
> "build AAB, click upload, done." Google rolled out **Android Developer
> Verification** ahead of its September 2026 mandate, and four undocumented
> (or under-documented) gates now sit between your EAS build and Internal
> Testing:
>
> 1. **Your dev account is probably on the wrong Google login.** Try `u/1`,
>    `u/2` in the Play Console URL before you assume you need to register.
> 2. **Package names must be pre-registered** before `Create app` will
>    accept them — and a "Draft" registration is not enough.
> 3. **Proving ownership requires an APK** (not the AAB you already have)
>    with a specific token file in `assets/` and the same signing
>    fingerprint.
> 4. **`expo prebuild` wipes `android/`**, so the token file vanishes.
>    Solution: a tiny Expo config plugin using `withDangerousMod`.
>
> If you skim nothing else, jump to [The config plugin
> that fixes it](#the-config-plugin-that-fixes-it).

---

## What I was trying to ship

I'm working on [TextStack](https://textstack.app) — a reader for dense
technical books where you tap any term and get a domain-aware,
native-language explanation. The web app has been live for a while; what
I needed today was the **mobile companion** out the door, even if only to
four friends in Internal Testing.

The mobile app is Expo 55 (React Native 0.83), TypeScript, file-based
Expo Router. Build pipeline: **EAS Build** producing a signed AAB. Total
"this should be easy" estimate: 30 minutes from `eas build` to a tester
installing on their phone.

Real time: **about four hours and seven EAS builds.**

Below is the map I wish I had at hour zero.

---

## Gate 1: The dev account on a different Google login

I opened `play.google.com/console` while signed into my main Google
account (`mrviduus@gmail.com`) and got the **"To get started, choose an
account type"** signup flow. Confusing — I knew I'd registered as a Play
developer years ago.

The trick: Google Play Console keys the dev-account lookup off the
**account index in the URL**, not whatever's the active session. The
account index is the `u/N` segment:

```
https://play.google.com/console/u/0/developers   ← mrviduus@gmail.com
https://play.google.com/console/u/1/developers   ← vasyl.vdov@gmail.com  ✓
```

If you have multiple Google accounts signed into Chrome, Play Console
shows whichever one matches `u/N` — not necessarily the one most recently
used elsewhere. **Try `u/0`, `u/1`, `u/2` before assuming you need to
register.**

Identity verification, by the way, is a separate one-time step that
takes 1–3 days for individuals and requires a government ID. Mine had
been done weeks earlier — easy to forget until you're staring at the
signup page wondering what went wrong.

---

## Gate 2: Package names must be pre-registered

After finding the right dev account, I clicked **Create app**, filled in
the form (`TextStack`, `app.textstack.mobile`, en-US, App, Free, accept
the three declarations — more on that below), clicked submit, and got:

> You can't use this package name because it hasn't been registered.

This wasn't in any 2023–2024 tutorial I'd seen. Old guides go "fill the
form, accept ToS, submit, done." In 2025 Google quietly added a new
left-nav item: **Android developer verification**. From the in-product
banner:

> Starting in September 2026, all Android apps must be registered by
> verified developers in order to be installable on certified Android
> devices in select regions.

The rollout is gradual but already enforced for new dev accounts. So
even though the public deadline is months away, you can't create your
first app until you've pre-registered the package name and proved you
own the signing key.

### The two-step proof of ownership

Open **Android developer verification → Register package name**. Enter
`app.textstack.mobile` and a friendly name. The package now sits in
**Draft** state with two unlocked tasks:

1. **Select an eligible public key** — pick the SHA-256 fingerprint that
   Google should associate with this package
2. **Sign and upload an APK** — prove you actually have the matching
   private key

#### Step 2.1: Selecting the eligible key

I clicked **Select key** expecting an empty list (this is a new dev
account, after all). Instead, a fingerprint was already there:

```
9B:CC:0E:FF:68:26:AE:3C:23:FA:95:12:AC:4F:43:BD:CD:29:8D:60:CC:F7:C3:EC:28:A3:38:4C:42:9A:E1:D2
```

That's the **EAS-managed upload key** fingerprint, automatically
populated because EAS had already produced a build artifact under this
package name. Google's ingestion pipeline records the signature of every
APK/AAB it sees, even via EAS infrastructure. Click the radio button,
**Add key**.

#### Step 2.2: Sign and upload an APK

Here's where it gets weird. The dialog says **"Sign and upload an
APK"** — and yes, it literally means **APK, not AAB**. The HTML file
input has `accept=".apk"`. EAS production builds default to AAB, so I
needed a separate APK build.

Critically, the APK must contain a **unique token file** that proves the
APK was built specifically for ownership verification on your account:

> 1. Copy the snippet below (unique to your account)
> 2. In your IDE, open the app's source tree
> 3. Inside the `assets` folder, create a file named exactly
>    `adi-registration.properties`
> 4. Paste the snippet into the file
> 5. Build a release APK signed with the private key matching the
>    fingerprint above
> 6. Upload it here

The snippet looks like a base32-style nonce: `DP5ACMZ5E2B4MAAAAAAAAAAAAA`
(26 chars, account-specific). The full Google sample is at
[github.com/android/security-samples/.../AndroidDeveloperVerificationAPKSigningExample](https://github.com/android/security-samples/tree/main/AndroidDeveloperVerificationAPKSigningExample).

This is where I lost three hours.

---

## Gate 3: Three declarations, not two

Side trip — most tutorials show **two** declarations on the Create app
form:

- Play App Signing Terms of Service
- US export laws

In 2026 there are **three**. The new one is at the top:

- **Developer Program Policies** — "Confirm app meets the Developer
  Program Policies"

Miss it and the form re-renders with all three boxes scrolled out of
view and a single red line under the missed one. Easy to chase your own
tail looking for an "invisible" error. Scroll back to the top.

---

## Gate 4: The token-file marathon

This is the rabbit hole. Four EAS builds — each ~15 minutes —
before Play Console accepted the APK.

### Build 4: token file missing

EAS profile `preview` already produces an APK by default:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" }
}
```

So I ran `eas build -p android --profile preview`. After 15 minutes I
had a signed APK in `~/Downloads`. Dropped it into Play Console.

> **The uploaded APK does not have the required token file.**

I'd created `apps/mobile/android/app/src/main/assets/adi-registration.properties`
on disk before building, but the file wasn't in the APK. Why?

```bash
git ls-files apps/mobile/android/   # → empty
cat apps/mobile/.gitignore | tail -2
# generated native folders
# /ios
# /android
```

The `android/` directory is gitignored — meaning **EAS regenerates it
on every build via `expo prebuild`**, and anything I dropped in there
gets wiped before the actual `gradle assembleRelease`.

### Build 5: trailing newline (27 bytes)

To survive prebuild, I wrote my first Expo config plugin (full version
below) and added it to `app.json`. New build:

> **The uploaded APK has an invalid token file.**

Different error, but still failing. I copied the APK into my workspace
and unzipped the asset:

```bash
unzip -p textstack-v1.0.0-build5-adi.apk \
  assets/adi-registration.properties | xxd
```

```
00000000: 4450 3541 434d 5a35 4532 4234 4d41 4141  DP5ACMZ5E2B4MAAA
00000010: 4141 4141 4141 4141 4141 4141 0a         AAAAAAAAAAA.
```

That `0a` at the end is `\n`. My plugin had `ADI_SNIPPET + '\n'` — a
27-byte file. Google's sample file
(`raw.githubusercontent.com/.../adi-registration.properties`) is **26
bytes, no trailing newline**. Removed the `\n`. Rebuild.

### Build 6: typo in the snippet (still 27 bytes)

> **The uploaded APK has an invalid token file.**

Same error. Confused, I unzipped again:

```
00000000: 4450 3541 434d 5a35 4532 4234 4d41 4141  DP5ACMZ5E2B4MAAA
00000010: 4141 4141 4141 4141 4141 41              AAAAAAAAAAA
```

Still 27 bytes. No newline this time — the **snippet itself** was
27 chars. I'd visually copied `DP5ACMZ5E2B4M` + "14 A's" instead of
13 A's. The trailing-A count is the kind of thing your eyes glide over.

How did I finally verify the snippet correctly? I clicked the **copy
icon** next to the snippet in the Play Console dialog, then ran:

```bash
pbpaste | xxd
pbpaste | wc -c
```

```
00000000: 4450 3541 434d 5a35 4532 4234 4d41 4141  DP5ACMZ5E2B4MAAA
00000010: 4141 4141 4141 4141 4141              AAAAAAAAAA
      26
```

There it is, byte-by-byte. Updated the plugin to **exactly 26 chars,
no newline**. One more build.

### Build 7: pass

> ✓ textstack-v1.0.0-build7-preview.apk

Green checkmark. Submit. Status flips to **In review** — Google's email
confirmation arrives within a few hours.

**Total cost of the token-file marathon: about 75 minutes of waiting on
EAS, plus the time to debug between attempts.** The lesson, in a sentence:
**verify the bytes inside the APK before clicking upload, every time.**

---

## The config plugin that fixes it

Save as `apps/mobile/plugins/with-adi-registration.js` and add
`"./plugins/with-adi-registration"` to your `app.json` `plugins` array.
Once Google verifies ownership, the plugin can be removed — the token
file only matters at verification time.

```js
// Expo config plugin: writes assets/adi-registration.properties into the
// generated android/app/src/main/assets/ folder during `expo prebuild`.
// Required by Google Play "Android developer verification" to prove
// ownership of the package name. The snippet is unique to the Play
// Console account and is checked at upload time inside the
// Sign and upload an APK flow.

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// 26-char token from Play Console "Sign and upload an APK" →
// "Copy the snippet". VERIFY this byte-for-byte with
// `pbpaste | wc -c` (must be 26). Easy to get wrong by visual copy —
// one extra/missing A and Google rejects with "invalid token file"
// after a 15-min build cycle.
const ADI_SNIPPET = 'DP5ACMZ5E2B4MAAAAAAAAAAAAA';

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      // Google compares the file content byte-for-byte — no trailing
      // newline, no BOM, no surrounding whitespace.
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        ADI_SNIPPET,
        'utf8'
      );
      return config;
    },
  ]);
};
```

The `withDangerousMod` hook runs after `expo prebuild` regenerates the
native folder, so files it writes survive into the actual gradle build.
Two minutes of plugin code, hours of pain avoided.

---

## Sanity-check the APK before every upload

Don't trust the build. Verify the bytes:

```bash
APK=$(ls -t ~/Downloads/textstack-v*-preview.apk | head -1)

# Should be 26
unzip -p "$APK" assets/adi-registration.properties | wc -c

# Should match the Play Console snippet exactly
unzip -p "$APK" assets/adi-registration.properties | xxd

# Diff against the snippet you copied
diff <(unzip -p "$APK" assets/adi-registration.properties) \
     <(printf 'DP5ACMZ5E2B4MAAAAAAAAAAAAA') \
  && echo MATCH || echo MISMATCH
```

If `MATCH` and 26 bytes — drag the APK into Play Console. If
`MISMATCH` — fix the plugin, don't burn another build.

---

## Once verification submits, the rest is normal

After clicking **Submit** on the verification dialog, the package name
moves to **In review** status. Google's docs say up to 48 hours; mine
let me proceed with **Create app immediately** (the form stopped
red-X-ing `app.textstack.mobile`), and the email confirmation came
later. Your mileage may vary.

From there, the Internal Testing setup is straightforward:

1. **Create app**: Fill the same form (name, package, en-US, App, Free,
   accept the three declarations). Submit.
2. **Internal testing → Create new release**: Drop the **production
   AAB** (yes, AAB this time — different artifact than what you used
   for verification) into the upload zone. Wait for Google's
   distribution optimization (couple of minutes).
3. **Release notes**: The textarea expects XML language tags:
   ```xml
   <en-US>
   TextStack 1.0.0 — Initial internal release.
   • Browse public-domain books
   • Offline reading, dictionary, translation, TTS
   • Spaced-repetition vocabulary builder
   </en-US>
   ```
4. **Testers tab → Create email list**: Comma-separated emails, Enter to
   commit, Save.
5. **Releases → Save and publish**: One warning ("no deobfuscation file")
   is informational — Expo doesn't run R8 by default. Click through.
6. **Copy opt-in URL** from "How testers join your test" and send to
   testers. Each tester opens the URL on their Android phone (signed
   into the same Google account that's in the email list), clicks
   accept, and the app appears in the Play Store usually within an hour.

Done. Real users on real phones from one EAS production AAB.

---

## What I'd tell yesterday-me

- **Check every Google account index** (`u/0`, `u/1`, `u/2`) in the
  Play Console URL before assuming you don't have a dev account.
- **Pre-register the package name** as a first action, not when the
  Create app form starts refusing.
- **Read every error literally.** "Does not have the required token
  file" and "has an invalid token file" are different bugs. The first
  is missing-file, the second is wrong-bytes.
- **Always verify bytes inside the APK** before uploading anything to
  Play Console. `unzip -p ... | wc -c` should match what you expect.
  This single habit would have saved me three 15-minute build cycles.
- **EAS prebuild wipes `android/`.** Any custom file you need in the
  release artifact requires a config plugin. `withDangerousMod` is the
  right hook for the simple cases.
- **Copy via the copy icon, not your eyes.** A 26-char string with
  thirteen identical letters at the end will defeat your visual
  counting every time.

---

## What's next for TextStack

Internal Testing is just the first track. To get the app onto the public
Play Store I still need to finish:

- **App content**: privacy policy URL, data safety form, target
  audience declarations
- **Store listing**: short and full descriptions, 8 phone screenshots,
  a 1024×500 feature graphic, the 512×512 icon
- A **closed test** with broader feedback before requesting production
  access

Each is its own small adventure. I'll write those up if they turn out
to have hidden gates of their own.

In the meantime, if you build dense technical books and want to try the
reader on the web first, the sample chapters are at
[textstack.app](https://textstack.app) — no signup. The mobile app is
in Internal Testing and rolling outward.

Spent the evening. Got the app live. Wrote it down so the next person
won't.

---

*Vasyl Vdovychenko — building [TextStack](https://textstack.app),
writing at [vasyl.blog](https://vasyl.blog), shouting on Twitter at
[@Rexetdeus](https://twitter.com/Rexetdeus).*
