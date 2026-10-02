// The browser pane's side of the Laravel Toolbar relay. The guest preload
// (apps/desktop/src/preview/LaravelToolbarPreload.ts) sends `{ kind, data }` on this channel
// with `ipcRenderer.sendToHost`; the hosting <webview> receives it as an `ipc-message` event.
import type { ToolbarSource } from "./context";
import { useLaravelToolbarStore } from "./store";
import type { ToolbarData } from "./types";

const CHANNEL = "laravel-toolbar";

/** Hides the page's own toolbar while T3 draws it under the page. */
const HIDE_PAGE_TOOLBAR_CSS = "#laravel-toolbar-shadow-host { display: none !important; }";

interface GuestWebview extends Element {
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  readonly insertCSS: (css: string) => Promise<string>;
}

function isPayload(value: unknown): value is ToolbarData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Handles one `ipc-message` from a browser tab's guest page; ignores other channels. */
export function relayLaravelToolbarMessage(tabId: string, webview: Element, event: Event) {
  const { channel, args } = event as Event & { channel?: string; args?: readonly unknown[] };
  if (channel !== CHANNEL) return;
  const message = args?.[0] as { kind?: unknown; data?: unknown } | undefined;
  const store = useLaravelToolbarStore.getState();
  switch (message?.kind) {
    case "page":
      if (!isPayload(message.data)) return;
      store.receivePage(tabId, message.data);
      void (webview as GuestWebview).insertCSS(HIDE_PAGE_TOOLBAR_CSS).catch(() => {});
      return;
    case "update":
      if (isPayload(message.data)) store.receiveUpdate(tabId, message.data);
      return;
    case "none":
      store.forget(tabId);
      return;
  }
}

function findWebview(tabId: string): GuestWebview | null {
  return (
    Array.from(document.querySelectorAll<GuestWebview>("webview[data-preview-tab]")).find(
      (candidate) => candidate.getAttribute("data-preview-tab") === tabId,
    ) ?? null
  );
}

/**
 * Loads history requests the way the page's toolbar does: a same-origin fetch in the page,
 * so the session cookie applies. The toolbar answers `{ summary, raw }`; `raw` is the payload.
 */
export function browserToolbarSource(
  tabId: string,
  openSource?: (target: string) => void,
): ToolbarSource {
  return {
    openSource,
    fetchDetails: async (id) => {
      const webview = findWebview(tabId);
      if (!webview) return null;
      const url = JSON.stringify(`/_toolbar/requests/${encodeURIComponent(id)}`);
      const result = await webview
        .executeJavaScript(
          `fetch(${url}, { credentials: "same-origin", headers: { Accept: "application/json", "X-Laravel-Toolbar-Internal": "true" } })` +
            `.then((response) => (response.ok ? response.json() : null)).catch(() => null)`,
        )
        .catch(() => null);
      const raw = (result as { raw?: unknown } | null)?.raw;
      return isPayload(raw) ? raw : null;
    },
  };
}
