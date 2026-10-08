// Reads the toolbar payload from response headers, for requests T3 sends itself (the API
// panel). nckrtl/laravel-toolbar and php-data-bridge send `x-toolbar` (base64 JSON payload),
// or `x-toolbar-summary` (base64 `{ request_id, history_row }`) when the payload is too big
// for a header; the full payload then comes from `/_toolbar/requests/{id}`.
import type { ToolbarData, ToolbarHistoryRow } from "./types";

export type ToolbarHeaderPayload =
  | { readonly kind: "full"; readonly data: ToolbarData }
  | { readonly kind: "summary"; readonly id: string; readonly row: ToolbarHistoryRow | null };

function decodeBase64Json(value: string): Record<string, unknown> | null {
  try {
    const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function headerValue(
  headers: ReadonlyArray<{ readonly name: string; readonly value: string }>,
  name: string,
): string | null {
  return headers.find((header) => header.name.toLowerCase() === name)?.value ?? null;
}

/** The toolbar data a response carries, or null when it has none (or only broken data). */
export function toolbarPayloadFromHeaders(
  headers: ReadonlyArray<{ readonly name: string; readonly value: string }>,
): ToolbarHeaderPayload | null {
  const full = headerValue(headers, "x-toolbar");
  const data = full ? decodeBase64Json(full) : null;
  if (data && typeof data.request_id === "string") {
    return { kind: "full", data: data as ToolbarData };
  }
  const summaryValue = headerValue(headers, "x-toolbar-summary");
  const summary = summaryValue ? decodeBase64Json(summaryValue) : null;
  if (summary && typeof summary.request_id === "string") {
    const row = summary.history_row;
    return {
      kind: "summary",
      id: summary.request_id,
      row:
        typeof row === "object" && row !== null && typeof (row as { id?: unknown }).id === "string"
          ? (row as ToolbarHistoryRow)
          : null,
    };
  }
  return null;
}
