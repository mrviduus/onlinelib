// config.js — API origin resolution for the "Send to TextStack" extension.
//
// Production default is https://textstack.app. The owner can override it for
// local dev via chrome.storage.local.apiOrigin (set in the options page), e.g.
// http://localhost:8080 — which ALSO requires temporarily adding
// "http://localhost:8080/*" to host_permissions in manifest.json (see README).

export const DEFAULT_API_ORIGIN = "https://textstack.app";

// Branded web connect page the device flow opens in a tab (reads ?code= and runs
// the same device-approve flow as /device, with extension-flavored copy).
export const CONNECT_PATH = "/connect-extension";

/** Resolve the active API origin (storage override → prod default). No trailing slash. */
export async function getApiOrigin() {
  const { apiOrigin } = await chrome.storage.local.get("apiOrigin");
  const origin = (apiOrigin && String(apiOrigin).trim()) || DEFAULT_API_ORIGIN;
  return origin.replace(/\/+$/, "");
}
