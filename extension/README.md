# Send to TextStack — Chrome extension (MV3)

Clip the article you're reading, or send a document (PDF/EPUB/FB2), to your own
private TextStack **Read-later** library. Vanilla JS, MV3, no bundler, no npm.

## What it does

- **Article** pages → extracted locally with Mozilla Readability, then
  `POST /me/books/clip`.
- **Selection** → clip only the highlighted text.
- **Preview & edit** → review/edit the cleaned title/author before sending.
- **Documents** (`.pdf` / `.epub` / `.fb2`) → fetched and `POST /me/books/upload`
  (multipart).
- **Right-click menus**: "Clip page to TextStack", "Clip selection to TextStack".
- **Connect** uses the OAuth 2.0 Device Authorization flow (RFC 8628) — the same
  device flow as the MCP CLI. No new backend.

Clips are private; the server enforces per-user ownership.

## Load unpacked (developer)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the toolbar icon, open the popup, click **Connect to TextStack** — a tab
   opens in the web app; approve the shown code while signed in there.

> Real sign-in is **owner-only** — only the account owner has TextStack
> credentials. The Connect flow opens the web app where you log in normally.

## The `node --check` gate

Every `.js` file must parse. Run before loading or committing:

```sh
cd extension
for f in $(find . -name '*.js' -not -path './lib/readability.js'); do node --check "$f" || exit 1; done
node --check lib/readability.js   # vendored third-party — also checked
```

(`lib/readability.js` is vendored verbatim from Mozilla; see `lib/THIRDPARTY.md`.)

## Developer: pointing at a local API

Production default is `https://textstack.app`. To target a local backend:

1. **Settings** (extension options page) → set **API origin** to
   `http://localhost:8080` → Save.
2. **Add the host permission**: edit `manifest.json` and add
   `"http://localhost:8080/*"` to `host_permissions`:

   ```json
   "host_permissions": [
     "https://textstack.app/*",
     "http://localhost:8080/*"
   ]
   ```

3. Reload the unpacked extension (`chrome://extensions` → reload).

Remove the localhost host permission before packaging for the store.

## Files

```
manifest.json     MV3 manifest
config.js         API origin resolution (storage override → prod default)
background.js     service worker — context menus, message router, device-flow polling
content.js        on-demand injected extractor (article / selection)
lib/auth.js       device flow (RFC 8628) + token refresh + disconnect
lib/api.js        Bearer fetch wrapper (401 → refresh → retry)
lib/readability.js  VENDORED Mozilla Readability 0.6.0 (Apache-2.0)
lib/THIRDPARTY.md   third-party provenance + re-vendor instructions
popup.html/.js    capture UI + recent clips + success actions
options.html/.js  connection status, Disconnect, dev API-origin override
privacy.html      privacy policy
icons/            icon-16/32/48/128.png (pre-existing)
```

## Owner-only / manual steps

By design, only these are manual (everything else is automatic):

- **Load unpacked** (above) — one time.
- **Real sign-in** — only the owner has credentials.
- **Web Store submission** — packaging + listing is owner-only.

## Notes

- The service worker can be evicted between events, so device-flow state lives in
  `chrome.storage.local` and polling runs on `chrome.alarms` (not `setInterval`).
- All API calls use `credentials: "omit"` and a clean `Authorization: Bearer`
  header (no CORS-with-credentials).
