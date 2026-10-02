import { create } from "zustand";

import { rowFromData } from "./model";
import type { ToolbarData, ToolbarHistoryRow } from "./types";

export interface HistoryEntry {
  readonly row: ToolbarHistoryRow;
  /** When T3 saw the request; the payload carries no timestamp. */
  readonly receivedAt: number;
}

export interface TabToolbar {
  /** The page's own request: the one the document was rendered by. */
  readonly currentId: string | null;
  readonly history: readonly HistoryEntry[];
  readonly details: Readonly<Record<string, ToolbarData>>;
  /** A request picked in the Requests panel; null shows the current one. */
  readonly selectedId: string | null;
}

interface LaravelToolbarState {
  readonly byTabId: Readonly<Record<string, TabToolbar>>;
  /** A full page load: the toolbar starts over from the document's payload. */
  readonly receivePage: (tabId: string, data: ToolbarData) => void;
  /** A later request (fetch, XHR, Inertia visit): a full payload or a summary row. */
  readonly receiveUpdate: (tabId: string, data: ToolbarData) => void;
  readonly receiveDetails: (tabId: string, id: string, data: ToolbarData) => void;
  readonly select: (tabId: string, id: string | null) => void;
  readonly clearHistory: (tabId: string) => void;
  /** The page left Laravel or reloaded without the toolbar. */
  readonly forget: (tabId: string) => void;
}

const EMPTY: TabToolbar = { currentId: null, history: [], details: {}, selectedId: null };

function upsert(history: readonly HistoryEntry[], row: ToolbarHistoryRow, now: number) {
  const index = history.findIndex((entry) => entry.row.id === row.id);
  if (index === -1) return [...history, { row, receivedAt: now }];
  const next = [...history];
  next[index] = { row, receivedAt: history[index]!.receivedAt };
  return next;
}

function update(
  state: LaravelToolbarState,
  tabId: string,
  change: (tab: TabToolbar) => TabToolbar,
): Pick<LaravelToolbarState, "byTabId"> {
  return { byTabId: { ...state.byTabId, [tabId]: change(state.byTabId[tabId] ?? EMPTY) } };
}

export const useLaravelToolbarStore = create<LaravelToolbarState>((set) => ({
  byTabId: {},
  receivePage: (tabId, data) =>
    set((state) => {
      const now = Date.now();
      const row = rowFromData(data);
      let history: HistoryEntry[] = (data.request_history ?? []).map((item) => ({
        row: item,
        receivedAt: now,
      }));
      // The server's own history row is richer (follow-up marks); build one only when missing.
      if (row && !history.some((entry) => entry.row.id === row.id)) {
        history = upsert(history, row, now);
      }
      return update(state, tabId, () => ({
        currentId: row?.id ?? null,
        history,
        details: row ? { [row.id]: data } : {},
        selectedId: null,
      }));
    }),
  receiveUpdate: (tabId, data) =>
    set((state) =>
      update(state, tabId, (tab) => {
        const now = Date.now();
        const full = data.profiler && data.request_id ? { [data.request_id]: data } : {};
        // Like the page's own toolbar: a payload with `request_history` replaces the state.
        // The server sends one for Inertia visits, which make a new page in the same document.
        if (Array.isArray(data.request_history)) {
          const seen = new Map(tab.history.map((entry) => [entry.row.id, entry.receivedAt]));
          return {
            currentId: data.selected_request_id ?? data.request_id ?? tab.currentId,
            history: data.request_history.map((row) => ({
              row,
              receivedAt: seen.get(row.id) ?? now,
            })),
            details: { ...tab.details, ...full },
            selectedId: null,
          };
        }
        const row = data.profiler ? rowFromData(data) : (data.history_row ?? null);
        if (!row) return tab;
        return {
          ...tab,
          history: upsert(tab.history, row, now),
          details: { ...tab.details, ...full },
        };
      }),
    ),
  receiveDetails: (tabId, id, data) =>
    set((state) =>
      update(state, tabId, (tab) => ({ ...tab, details: { ...tab.details, [id]: data } })),
    ),
  select: (tabId, id) =>
    set((state) =>
      update(state, tabId, (tab) => ({
        ...tab,
        selectedId: id === tab.currentId ? null : id,
      })),
    ),
  clearHistory: (tabId) =>
    set((state) =>
      update(state, tabId, (tab) => ({
        ...tab,
        history: tab.history.filter((entry) => entry.row.id === tab.currentId),
        selectedId: null,
      })),
    ),
  forget: (tabId) =>
    set((state) => {
      if (!state.byTabId[tabId]) return state;
      const { [tabId]: _removed, ...rest } = state.byTabId;
      return { byTabId: rest };
    }),
}));
