# Four Hidden Gates Between Your Expo Build and Google Play in 2026

Real time from `eas build` to my first tester on Google Play: **four hours and seven builds**. Google rolled out **Android Developer Verification** ahead of its September 2026 mandate, and the path from a fresh EAS-built AAB to an Internal Testing release no longer looks like the tutorials. Below is the map I wish I'd had at hour zero.

## TL;DR

Four undocumented (or under-documented) gates now sit between your Expo build and Internal Testing:

1. **Your dev account is probably on the wrong Google login.** Try `u/1`, `u/2` in the Play Console URL before assuming you need to re-register.
2. **Package names must be pre-registered** before *Create app* will accept them — a "Draft" registration is **not** enough.
3. **Proving ownership requires an APK** (not the AAB you already have) containing a specific token file in `assets/`, signed with the same key.
4. **`expo prebuild` wipes `android/`**, so the token file vanishes from your APK. Solution: a tiny Expo config plugin using `withDangerousMod`.

If you skim nothing else, the [config plugin below](#the-config-plugin-that-fixes-it) is the load-bearing piece. The single habit that would have saved me three 15-minute build cycles: **verify the bytes inside the APK before clicking upload, every time.**

---

## What I was shipping

I work on [TextStack](https://textstack.app) — a reader for dense technical books where you tap any term and get a domain-aware, native-language explanation. The web app has been live for a while; what I needed today was the **mobile companion** in front of four friends in Internal Testing.

Stack: Expo 55, React Native 0.83, TypeScript, file-based Expo Router. Build pipeline: **EAS Build** producing a signed AAB. "This should be easy" estimate: 30 minutes from `eas build` to a tester installing on their phone.

Real time: four hours, seven builds.

---

## Gate 1 — The dev account on a different Google login

I opened `play.google.com/console` while signed into my main Google account and got the **"To get started, choose an account type"** signup flow. Confusing — I'd registered as a Play developer years ago.

The trick: Play Console keys the dev-account lookup off the **account index in the URL**, not whichever account is most active in the browser:

```
play.google.com/console/u/0/developers   ← first Google account
play.google.com/console/u/1/developers   ← second Google account  ✓
play.google.com/console/u/2/developers   ← third
```

If you have multiple Google accounts signed into Chrome, Play Console renders whichever matches `u/N`. **Try every index before assuming you need to register.**

Identity verification, by the way, is a separate one-time step (1–3 days for individuals, government ID required). Mine had been done weeks earlier — easy to forget you've already done it when you're staring at a signup page.

---

## Gate 2 — Package names must be pre-registered

After finding the right dev account I clicked **Create app**, filled in the form (app name, package, en-US, App, Free, accept the three declarations — more on those below), submitted, and got:

> You can't use this package name because it hasn't been registered.

This was in **no** 2023–2024 tutorial I'd seen. The old flow was "fill the form, accept ToS, submit, done." In 2025 Google quietly added a new left-nav item: **Android developer verification**. From the in-product banner:

> Starting in September 2026, all Android apps must be registered by verified developers in order to be installable on certified Android devices in select regions.

The rollout is gradual but already enforced for new dev accounts. Even though the public deadline is months away, you cannot create your first app until you've pre-registered the package name and proved you own the signing key.

### The two-step proof of ownership

Open **Android developer verification → Register package name**. Enter the package and a friendly name. The package now sits in **Draft** state with two unlocked tasks:

1. **Select an eligible public key** — pick the SHA-256 fingerprint Google should associate with this package.
2. **Sign and upload an APK** — prove you actually have the matching private key.

#### Selecting the eligible key

I clicked **Select key** expecting an empty list (new dev account, after all). Instead, a fingerprint was already there:

```
XX:XX:XX:XX:XX:XX:XX:XX:…:XX:XX:XX:XX  (your EAS upload key)
```

That's the **EAS-managed upload key** fingerprint, automatically populated because EAS had already produced a build artifact under this package name. Google's ingestion records signatures of every APK/AAB it sees, even via EAS infrastructure. Click the radio button, **Add key**.

#### Sign and upload an APK — yes, APK, not AAB

The dialog reads **"Sign and upload an APK"** — and literally means it. The HTML file input has `accept=".apk"`. EAS production builds default to AAB, so you need a **separate APK build** for this step.

Crucially, the APK must contain a **unique token file** that proves it was built specifically for ownership verification on your account:

1. Copy the snippet from the dialog (a ~26-char base32-style nonce, account-specific).
2. In your app's source tree, create `assets/adi-registration.properties` containing exactly that snippet — no trailing newline, no BOM, no whitespace.
3. Build a release APK signed with the private key matching the fingerprint above.
4. Upload it.

Google's reference sample: [`android/security-samples/AndroidDeveloperVerificationAPKSigningExample`](https://github.com/android/security-samples/tree/main/AndroidDeveloperVerificationAPKSigningExample).

This is the step that consumed my evening.

---

## Gate 3 — Three declarations, not two

A side trip — most tutorials show **two** declarations on the Create app form:

- Play App Signing Terms of Service
- US export laws

In 2026 there are **three**. The new one is on top:

- **Developer Program Policies** — *"Confirm app meets the Developer Program Policies"*

Miss it and the form re-renders with all three boxes scrolled out of view and one red line under the missed one. Easy to chase your tail looking for an "invisible" error. Scroll to the top.

---

## Gate 4 — The token-file marathon

This is where I lost three hours. Four builds, ~15 minutes each, before Play Console accepted the APK.

EAS profile `preview` already produces an APK:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" }
}
```

So I ran `eas build -p android --profile preview`, waited 15 minutes, dropped the APK into Play Console. Each attempt failed differently:

| Build | Result | Diagnosis |
|---|---|---|
| #4 | "does not have the required token file" | File missing entirely |
| #5 | "has an invalid token file" | File present, **27 bytes** (trailing `\n`) |
| #6 | "has an invalid token file" | **27 bytes** again — typo, 14 trailing A's instead of 13 |
| #7 | ✓ accepted | **26 bytes**, exact match |

The lesson rephrased: read every error literally. *"Does not have"* and *"has an invalid"* are different bugs.

### Why my file wasn't in the APK (build #4)

I'd created `apps/mobile/android/app/src/main/assets/adi-registration.properties` on disk before building. But the file wasn't in the APK. Why?

```
$ cat apps/mobile/.gitignore
…
# generated native folders
/ios
/android
```

The `android/` directory is **gitignored** — meaning EAS regenerates it on every build via `expo prebuild`. Anything you drop in there gets wiped before `gradle assembleRelease` ever runs.

### Why "26 bytes" mattered (builds #5 and #6)

After my first config plugin landed the file in the APK, the error changed to *"invalid"*. I copied the APK into a working directory and unzipped the asset:

```bash
unzip -p textstack-v1.0.0-build5-adi.apk \
  assets/adi-registration.properties | xxd
```

```
00000000: <hex>… 0a       …last byte 0x0a (newline)
```

My plugin had `ADI_SNIPPET + '\n'` — a 27-byte file. The Google sample file in the reference repo is **26 bytes, no trailing newline**. Removed the `\n`, rebuilt.

Build #6 was still 27 bytes — this time the **snippet itself** was 27 chars. I'd visually copied the snippet, and miscounted the trailing A's by one. (Try counting "AAAAAAAAAAAAA" vs "AAAAAAAAAAAAAA" in a single glance. Your eyes won't.) The right way:

```bash
# Click the copy icon in Play Console next to the snippet, then:
pbpaste | wc -c   # → 26 (or whatever the spec says)
pbpaste | xxd     # confirms exact bytes
```

26 bytes, byte-for-byte. Updated the plugin. Build #7 passed.

**Cost of the marathon: ~75 minutes of waiting on EAS plus the debugging in between.** A single `unzip -p | wc -c` would have caught both mistakes before the upload.

---

## The config plugin that fixes it

Save as `apps/mobile/plugins/with-adi-registration.js` and add `"./plugins/with-adi-registration"` to your `app.json` `plugins` array. The `ADI_SNIPPET` constant is account-specific — copy yours from the Play Console dialog and verify with `pbpaste | wc -c` before building.

```js
// Expo config plugin: writes assets/adi-registration.properties into the
// generated android/app/src/main/assets/ folder during expo prebuild.
// Required by Google Play "Android developer verification" to prove
// ownership of the package name. The snippet is unique to the Play
// Console account and is checked at upload time inside the
// Sign and upload an APK flow.

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Account-specific token from Play Console:
// "Sign and upload an APK" → "Copy the snippet".
// VERIFY this byte-for-byte (`pbpaste | wc -c`) — visual copy fails
// because the trailing-A run defeats human counting.
const ADI_SNIPPET = 'YOUR_ACCOUNT_SPECIFIC_SNIPPET_HERE';

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      // Google compares byte-for-byte — no trailing newline, no BOM,
      // no surrounding whitespace.
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

`withDangerousMod` runs after `expo prebuild` regenerates the native folder, so files it writes survive into the gradle build. Two minutes of plugin code, hours of pain avoided.

**Once Google verifies ownership the plugin can be removed** — the token file only matters during verification.

---

## Sanity-check the APK before every upload

Don't trust the build. Verify the bytes:

```bash
APK=$(ls -t ~/Downloads/your-app-v*-preview.apk | head -1)

# Should be exactly the expected length
unzip -p "$APK" assets/adi-registration.properties | wc -c

# Should match the Play Console snippet exactly
unzip -p "$APK" assets/adi-registration.properties | xxd

# Diff against the snippet you literally copied
SNIPPET="$(pbpaste)"
diff <(unzip -p "$APK" assets/adi-registration.properties) \
     <(printf '%s' "$SNIPPET") \
  && echo MATCH || echo MISMATCH
```

If MATCH and the byte count matches — drag the APK into Play Console. If MISMATCH — fix the plugin, don't burn another 15-minute build.

---

## Once verification submits, the rest is normal

After clicking **Submit** on the verification dialog, the package name moves to **In review**. Google's docs say up to 48 hours; in my case the *Create app* form stopped red-X-ing the package name immediately, and the email confirmation arrived later. YMMV.

From there, Internal Testing is the well-trodden path:

1. **Create app**: Same form (name, package, language, App, Free, three declarations). Submit.
2. **Internal testing → Create new release**: Drop the **production AAB** (yes, AAB this time — different artifact than what you used for verification) into the upload zone. Wait for Google's distribution optimization (a couple of minutes).
3. **Release notes**: The textarea expects XML language tags:
   ```xml
   <en-US>
   Your release notes here.
   • Bullet 1
   • Bullet 2
   </en-US>
   ```
4. **Testers tab → Create email list**: Comma-separated emails, Enter to commit, Save. Bind the list to the track.
5. **Releases → Save and publish**: One warning ("no deobfuscation file") is informational — Expo doesn't run R8 by default. Click through the publish confirmation.
6. **Copy the opt-in URL** from "How testers join your test" and send it to testers. Each opens the URL on their Android phone (signed into the Google account in the email list), clicks accept, and the app appears in the Play Store usually within an hour.

Done. Real users on real phones from one EAS production AAB.

---

## What I'd tell yesterday-me

- **Check every Google account index** (`u/0`, `u/1`, `u/2`) in the Play Console URL before assuming you don't have a dev account.
- **Pre-register the package name** as a first action, not when *Create app* starts rejecting it.
- **Read every error literally.** "Does not have the required token file" and "has an invalid token file" are different bugs.
- **Always verify bytes inside the APK** before uploading anything to Play Console. `unzip -p ... | wc -c` is the single habit that saves the most time.
- **EAS prebuild wipes `android/`.** Any custom file in the release artifact requires a config plugin. `withDangerousMod` is the right hook for simple file writes.
- **Copy via the copy icon, not your eyes.** A 26-character string with thirteen identical letters at the end will defeat your visual counting every time.

---

## What's next

Internal Testing is one track. To reach the public Play Store I still owe:

- **App content**: privacy policy URL, data safety form, target audience declarations.
- **Store listing**: short and full descriptions, eight phone screenshots, a 1024×500 feature graphic, a 512×512 icon.
- A **closed test** with broader feedback before requesting production access.

Each is its own small adventure. I'll write those up if they turn out to have hidden gates of their own.

If you build dense technical books and want to try the reader on the web first, the sample chapters are at [textstack.app](https://textstack.app) — no signup. The mobile app is in Internal Testing and rolling outward.

Spent the evening. Got the app live. Wrote it down so the next person won't have to.
