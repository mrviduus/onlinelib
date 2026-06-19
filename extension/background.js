// background.js — MV3 service worker (type: module). The orchestration hub:
//   • registers context menus
//   • drives the device-flow poll on chrome.alarms ticks
//   • routes messages from the popup (extract, clip, upload, connect, status)
//   • performs the on-demand content-script injection + extraction
//
// All network/auth lives here and in lib/*. The SW can be evicted between events,
// so it holds no long-lived in-memory state (flow state is in chrome.storage.local).

import { POLL_ALARM, pollOnce, startDeviceFlow, isConnected, disconnect, getTokens } from "./lib/auth.js";
import { clip, upload, listReadLater, me, NotConnectedError } from "./lib/api.js";

const MENU_PAGE = "textstack-clip-page";
const MENU_SELECTION = "textstack-clip-selection";

const DOC_EXTENSIONS = /\.(pdf|epub|fb2)(\?|#|$)/i;
const DOC_CONTENT_TYPES = [
  "application/pdf",
  "application/epub+zip",
  "application/x-fictionbook+xml",
  "application/fb2",
];

// ── lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: "Clip page to TextStack",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "Clip selection to TextStack",
    contexts: ["selection"],
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) {
    pollOnce().catch((e) => console.warn("[TextStack] poll error", e));
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const mode = info.menuItemId === MENU_SELECTION ? "selection" : "page";
  clipActiveTab(tab, mode).catch((e) => notify(`Clip failed: ${e.message}`));
});

// ── message router (popup ↔ background) ──────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message, notConnected: !!e.notConnected }));
  return true; // async response
});

async function handleMessage(msg) {
  switch (msg?.type) {
    case "status":
      return getStatus();
    case "connect":
      return startDeviceFlow();
    case "disconnect":
      await disconnect();
      return { connected: false };
    case "detectPageType": {
      const tab = await activeTab();
      return { kind: await detectPageType(tab), url: tab?.url, title: tab?.title };
    }
    case "extract": {
      const tab = await activeTab();
      return extractFromTab(tab, msg.mode || "page");
    }
    case "clip":
      return clip(msg.payload);
    case "clipActive": {
      const tab = await activeTab();
      return clipActiveTab(tab, msg.mode || "page");
    }
    case "sendDocument": {
      const tab = await activeTab();
      return sendDocument(tab);
    }
    case "recent":
      return listReadLater();
    case "me":
      return me();
    default:
      throw new Error(`Unknown message: ${msg?.type}`);
  }
}

// ── status ───────────────────────────────────────────────────────────────────

async function getStatus() {
  const connected = await isConnected();
  let email = null;
  if (connected) {
    try {
      const profile = await me();
      email = profile?.user?.email || null;
    } catch (e) {
      if (e instanceof NotConnectedError) return { connected: false };
      // Transient — still report connected.
    }
  }
  return { connected, email };
}

// ── page-type detection ──────────────────────────────────────────────────────

async function detectPageType(tab) {
  const url = tab?.url || "";
  if (DOC_EXTENSIONS.test(url)) return "document";
  if (!/^https?:/i.test(url)) return "article"; // can't HEAD non-http; assume article
  try {
    const res = await fetch(url, { method: "HEAD", credentials: "omit" });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (DOC_CONTENT_TYPES.some((t) => ct.includes(t))) return "document";
  } catch {
    /* HEAD blocked (CORS/etc) → treat as article */
  }
  return "article";
}

// ── article extraction (inject readability + content, then call extractor) ────

async function extractFromTab(tab, mode) {
  if (!tab || tab.id == null) throw new Error("No active tab.");
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["lib/readability.js", "content.js"],
  });
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [mode],
    func: (m) => window.__textstackExtract(m),
  });
  if (!result || !result.ok) {
    throw new Error(result?.error || "Could not extract article content.");
  }
  return { ...result, sourceUrl: tab.url };
}

// ── high-level actions ───────────────────────────────────────────────────────

/** Extract + clip in one shot (used by context menus and the popup's quick button). */
async function clipActiveTab(tab, mode) {
  const article = await extractFromTab(tab, mode);
  const result = await clip({
    title: article.title,
    author: article.byline,
    sourceUrl: article.sourceUrl,
    html: article.content,
    language: article.lang,
  });
  notify("Clipped to TextStack");
  return result;
}

/** Fetch the document bytes and upload as multipart file. */
async function sendDocument(tab) {
  if (!tab?.url) throw new Error("No active tab.");
  const res = await fetch(tab.url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Could not fetch document (${res.status}).`);
  const blob = await res.blob();
  const filename = filenameFromUrl(tab.url);
  const result = await upload(blob, filename);
  notify("Document sent to TextStack");
  return result;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function filenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split("/").pop() || "");
    if (base && /\.(pdf|epub|fb2)$/i.test(base)) return base;
    return base || "document";
  } catch {
    return "document";
  }
}

function notify(message) {
  // Best-effort badge feedback (no "notifications" permission requested).
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
  console.info("[TextStack]", message);
}

// Surface tokens for debugging in the SW console (not exported to pages).
globalThis.__textstackTokens = getTokens;
