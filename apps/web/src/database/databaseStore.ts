import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";
import { useRightPanelStore } from "../rightPanelStore";

// The Database panel's remembered connection and SQL per project (persisted), and queries
// handed over from the Laravel Toolbar (per thread, until the panel runs them).

export interface DatabaseProjectState {
  readonly connection: string | null;
  readonly sqlByConnection: Readonly<Record<string, string>>;
}

export interface PendingDatabaseQuery {
  readonly sql: string;
  readonly nonce: number;
}

interface DatabaseState {
  readonly byProjectKey: Readonly<Record<string, DatabaseProjectState>>;
  readonly pendingByThreadKey: Readonly<Record<string, PendingDatabaseQuery>>;
  readonly setConnection: (projectKey: string, slug: string) => void;
  readonly setSql: (projectKey: string, slug: string, sql: string) => void;
  readonly setPending: (threadKey: string, sql: string) => void;
  readonly clearPending: (threadKey: string, nonce: number) => void;
}

const EMPTY_PROJECT: DatabaseProjectState = { connection: null, sqlByConnection: {} };

export const useDatabaseStore = create<DatabaseState>()(
  persist(
    (set) => ({
      byProjectKey: {},
      pendingByThreadKey: {},
      setConnection: (projectKey, slug) =>
        set((state) => ({
          byProjectKey: {
            ...state.byProjectKey,
            [projectKey]: {
              ...(state.byProjectKey[projectKey] ?? EMPTY_PROJECT),
              connection: slug,
            },
          },
        })),
      setSql: (projectKey, slug, sql) =>
        set((state) => {
          const project = state.byProjectKey[projectKey] ?? EMPTY_PROJECT;
          return {
            byProjectKey: {
              ...state.byProjectKey,
              [projectKey]: {
                ...project,
                sqlByConnection: { ...project.sqlByConnection, [slug]: sql },
              },
            },
          };
        }),
      setPending: (threadKey, sql) =>
        set((state) => ({
          pendingByThreadKey: {
            ...state.pendingByThreadKey,
            [threadKey]: { sql, nonce: Date.now() },
          },
        })),
      clearPending: (threadKey, nonce) =>
        set((state) => {
          if (state.pendingByThreadKey[threadKey]?.nonce !== nonce) return state;
          const { [threadKey]: _removed, ...rest } = state.pendingByThreadKey;
          return { pendingByThreadKey: rest };
        }),
    }),
    {
      name: "t3code:database-panel:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byProjectKey: state.byProjectKey }),
    },
  ),
);

/** Opens the thread's Database panel and runs `sql` there (from the Laravel Toolbar). */
export function openDatabaseQuery(threadRef: ScopedThreadRef, sql: string): void {
  useDatabaseStore.getState().setPending(scopedThreadKey(threadRef), sql);
  useRightPanelStore.getState().open(threadRef, "database");
}
