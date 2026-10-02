// Relays the Laravel Toolbar's data from a browser page to T3, which draws the toolbar under
// the page. The page's own toolbar (nckrtl/laravel-toolbar) puts the document's payload in
// `window.__LARAVEL_TOOLBAR_DATA__` and fires `laravel-toolbar:update` for later requests;
// this preload shares `window` with the page (contextIsolation is off) and forwards both to
// the hosting renderer. Channel and message shape: apps/web/src/laravelToolbar/bridge.ts.
import { ipcRenderer } from "electron";

const CHANNEL = "laravel-toolbar";

/** Structured clone needs plain data; the payload is JSON but may carry page objects. */
function plain(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function send(kind: "page" | "update" | "none", data?: unknown) {
  ipcRenderer.sendToHost(CHANNEL, { kind, data: data === undefined ? undefined : plain(data) });
}

window.addEventListener("DOMContentLoaded", () => {
  const data = (window as { __LARAVEL_TOOLBAR_DATA__?: unknown }).__LARAVEL_TOOLBAR_DATA__;
  if (data && typeof data === "object") send("page", data);
  else send("none");
});

window.addEventListener("laravel-toolbar:update", (event) => {
  const data = (event as CustomEvent<{ data?: unknown }>).detail?.data;
  if (data && typeof data === "object") send("update", data);
});
