// Expo config plugin: writes assets/adi-registration.properties into the
// generated android/app/src/main/assets/ folder during `expo prebuild`.
// Required by Google Play "Android developer verification" to prove ownership
// of the package name. The snippet is unique to the Play Console account and
// is checked at upload time inside the Sign and upload an APK flow.
//
// Once package ownership is verified on Play Console, this plugin can be
// removed (the token file is only needed at verification time).

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// 26-char token from Play Console "Sign and upload an APK" → "Copy the snippet".
// VERIFY this byte-for-byte with `pbpaste | wc -c` (must be 26). Easy to get
// wrong by visual copy — one extra/missing A and Google rejects with
// "invalid token file" after 15-min build cycle.
const ADI_SNIPPET = 'DP5ACMZ5E2B4MAAAAAAAAAAAAA';

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      // Google's verification compares the file content byte-for-byte against
      // the snippet — no trailing newline, no BOM, no surrounding whitespace.
      // The Google sample file in
      // github.com/android/security-samples/.../adi-registration.properties is
      // exactly the bare 26-char token. Writing `ADI_SNIPPET + '\n'` made
      // Play Console reject the APK with "invalid token file".
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        ADI_SNIPPET,
        'utf8'
      );
      return config;
    },
  ]);
};
