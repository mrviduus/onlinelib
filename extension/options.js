// options.js — connection status, Disconnect, and the dev API-origin override.

import { DEFAULT_API_ORIGIN } from "./config.js";

const $ = (id) => document.getElementById(id);

function send(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp?.ok) return reject(new Error(resp?.error || "Failed"));
      resolve(resp.data);
    });
  });
}

async function refreshStatus() {
  const el = $("status");
  try {
    const status = await send("status");
    if (status.connected) {
      el.textContent = "Connected";
      el.className = "status ok";
      $("email").textContent = status.email ? `Signed in as ${status.email}` : "";
    } else {
      el.textContent = "Not connected";
      el.className = "status off";
      $("email").textContent = "Open the toolbar popup to connect.";
    }
  } catch (e) {
    el.textContent = "Not connected";
    el.className = "status off";
    $("email").textContent = e.message;
  }
}

$("btn-disconnect").addEventListener("click", async () => {
  try {
    await send("disconnect");
    $("disconnect-msg").textContent = "Disconnected.";
    refreshStatus();
  } catch (e) {
    $("disconnect-msg").textContent = e.message;
  }
});

$("btn-save").addEventListener("click", async () => {
  const val = $("origin").value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ apiOrigin: val || "" });
  $("save-msg").textContent = val
    ? `Saved. Using ${val} — ensure host_permissions includes it.`
    : `Saved. Using production default (${DEFAULT_API_ORIGIN}).`;
});

async function loadOrigin() {
  const { apiOrigin } = await chrome.storage.local.get("apiOrigin");
  $("origin").value = apiOrigin || "";
}

loadOrigin();
refreshStatus();
