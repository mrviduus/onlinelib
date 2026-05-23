# The Five Things Google Doesn't Tell You About Shipping an Expo App to Play Store

**TL;DR:** I tried to ship TextStack's first Android build to Google Play. Five separate gotchas cost me an evening — each one cheap individually, but they compound in a specific order that you only learn by hitting them. Here's the order, the fix for each, and the order-of-operations that would have saved me a fresh build at every step.

---

## The Setup

TextStack is an Expo / React Native reader (EPUB / PDF / FB2 → web-parity reader, vocab SRS, offline library). The web app and PWA have been live for months. Mobile reader has been usable internally for a while. Today's plan: push the first APK to a tester device + queue the AAB for Google Play **Internal testing**.

Stack relevant to this story:
- **Expo SDK 55**, managed workflow (no checked-in `android/` directory — generated on every build)
- **EAS Build** for cloud builds (`eas build -p android --profile production` → AAB; `--profile preview` → APK)
- **EAS-managed keystore** (a single upload key shared across `production` and `preview` profiles — fingerprint stays the same)
- **Google Play Console**, multi-account environment (TODO: details on the multi-account setup — `vasyl.vdov@gmail.com` admin, second account for the developer registration, why the split exists)

What I expected: drag an AAB into Play Console, fill in a few forms, hit publish, done.

What actually happened: **Play Console rejected the AAB before even letting me create the listing**, because the package name `app.textstack.mobile` wasn't *verified* yet against my developer account.

That's where the rabbit hole starts.

---

## Gotcha #1: AAB vs APK at ownership-verification time

Play Console's package-ownership flow is one of those things Google added late and never quite finished documenting. For a **new app you've never uploaded before**, Google needs to prove that the developer account uploading it actually owns the package name.

The flow they hand you is called **"Sign and upload an APK"**, and the word *APK* there is literal. You can have a perfectly valid `.aab` ready to ship — Play Console **will not accept it for the verification step**. It wants an APK signed with the same upload key.

So my production build pipeline (which only produced an AAB) was useless for this one specific gate. I needed a parallel APK build with the same key.

```bash
# This produces an .aab — for actual rollout to Internal/Closed/Production tracks.
eas build -p android --profile production

# This produces an .apk — same upload key, but APK distribution.
# Used for the ownership-verification step only.
eas build -p android --profile preview
```

`eas.json` profiles were already shaped right (`buildType: "apk"` on `preview`, `STORE` distribution on `production`); the fix was just to *run the preview profile too*, not to change config. ~15 min in the cloud queue.

> **Save yourself a step:** the first build you upload to a brand-new Play Console app should be an APK, not an AAB. After ownership is verified, switch to AAB for actual releases.

---

## Gotcha #2: The Android Developer Verification snippet

After uploading the APK Play Console came back with a second hurdle: a **registration snippet** that has to live inside the APK itself, at a specific path, with a specific filename.

The snippet for my account looked like this:

```
DP5ACMZ5E2B4MAAAAAAAAAAAAA
```

It belongs in `android/app/src/main/assets/adi-registration.properties` inside the built APK. Play Console reads it at upload time to confirm the build came from the developer account claiming the package.

That's already weird (a per-account token baked into the binary?), but the *real* trap is the next gotcha.

---

## Gotcha #3: `expo prebuild` blows away the `android/` directory

Expo's **managed workflow** doesn't ship a checked-in `android/` folder. Every EAS build runs `expo prebuild` first, which **regenerates** `android/` from scratch based on `app.json` and installed packages. Anything you put under `android/` manually gets nuked at build time.

That means a "just paste the file into `android/app/src/main/assets/`" workaround works **once** locally, then disappears the moment EAS builds in the cloud.

The fix is a **config plugin** — a small Node module that runs during `prebuild` and writes files into the generated tree, every time:

```js
// apps/mobile/plugins/with-adi-registration.js
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

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
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        ADI_SNIPPET + '\n',
        'utf8'
      );
      return config;
    },
  ]);
};
```

Wire it into `app.json`:

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "./plugins/with-adi-registration"
    ]
  }
}
```

The `withDangerousMod` API is the right tool: it lets you write directly into the prebuild output. The "dangerous" name is real — anything in there runs after Expo's own modifications, so you have to be careful not to stomp generated config — but for "write one file into assets" it's exactly what you need.

> Once ownership is verified on Play Console, you can remove the plugin. The token file is only needed at verification time, not for ongoing releases.

---

## Gotcha #4: Multi-account Play Console gymnastics

<!-- TODO: this section needs vasyl's notes:
  - Why two Google accounts (vasyl.vdov@gmail.com admin + the dev-registration account)?
  - Where exactly did the verification token come from — Console > Setup > ? > ?
  - Three declarations (data safety / target audience / something else?) and which one is the one most people forget
  - Did `vasyl.vdov@gmail.com` need to be added as a second admin to the second account, or was it the other direction?
-->

*(Filling in once Vasyl shares the multi-account walkthrough.)*

---

## Gotcha #5: Three declarations Play Console won't let you skip

<!-- TODO: which three? Best guesses:
  1. App Content / Privacy policy (URL)
  2. Data safety (questionnaire about what data you collect, share, encrypt in transit, etc)
  3. Government / news / financial declarations? Target audience + content rating?
  Need Vasyl's actual sequence + which one was the most annoying.
-->

*(Filling in once Vasyl confirms which three he hit and in what order.)*

---

## The order-of-operations I wish I'd had

If I were doing this from a clean repo, in the order that avoids redoing builds:

1. **Create the Play Console app first** — get to the screen where it asks for the verification snippet, before you build anything.
2. **Add the snippet via a config plugin**, not by hand-editing `android/`. Commit the plugin.
3. **Build a preview APK** (`--profile preview`). This is the APK you upload for "Sign and upload an APK". Same keystore as production, signed by EAS.
4. **Drag the APK into the ownership-verification form.** Wait for Play Console to confirm.
5. **Now** build the production AAB (`--profile production`). Same keystore, same package name, but the format Play Console actually wants for Internal/Closed/Production tracks.
6. **Upload the AAB to Internal testing track.** Add tester emails (yourself first). Roll out.

Total: 2 EAS builds (one APK, one AAB), 0 wasted ones — if you do it in this order.

Total I actually did: **4 EAS builds**, because I learned each gotcha in production order and had to re-run with the fix.

---

## What's still hand-wavy

The bits I haven't actually run myself yet (filling in as I go):

- The multi-account Play Console flow — there's a *reason* it's split that's specific to TextStack. (Section above.)
- The three declarations — I know there are at least three forms Play Console blocks rollout on, but my notes from today don't match what I expected. (Section above.)
- `eas submit` for future releases — once ownership is verified, the manual upload becomes a one-line `eas submit --platform android --profile production`. Haven't wired that up yet because I needed to clear ownership first.

---

## Why I'm writing this down

The Expo + Play Store gotchas above are individually all over StackOverflow, but I couldn't find a single page that strung them together in the order you'll hit them on a brand-new app. The order matters: Gotcha #1 sends you to build #2, Gotcha #3 invalidates the file you put in build #1, and Gotchas #4 and #5 block you *after* ownership is verified, so they hide until you've cleared the first three.

If you're shipping your first Expo Android build to Play Console, hit the gotchas in the right order. Don't be me.
