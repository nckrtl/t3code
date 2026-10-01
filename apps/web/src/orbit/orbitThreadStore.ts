import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";

/**
 * A thread whose worktree T3 created in Orbit's managed path. It is registered
 * as an Orbit Instance once T3 has named its branch (see OrbitRegistrationSync).
 */
export interface OrbitThreadInstance {
  readonly environmentId: string;
  readonly threadId: string;
  /** `registering` until Orbit adopted the worktree; `failed` keeps the reason. */
  readonly phase: "registering" | "registered" | "failed";
  readonly instanceName: string;
  readonly projectId: number;
  readonly projectSlug: string;
  readonly tld: string;
  /** The project root, an existing folder for the hidden Orbit shell. */
  readonly controlCwd: string;
  readonly checkoutPath: string;
  readonly temporaryBranch: string;
  readonly createdAt: string;
  readonly instanceId: number | null;
  readonly url: string | null;
  readonly failure: string | null;
  /** Set when registration should run again after an unreachable machine. */
  readonly retryAt?: number;
}

interface OrbitThreadStoreState {
  byThreadKey: Record<string, OrbitThreadInstance>;
  register: (ref: ScopedThreadRef, instance: OrbitThreadInstance) => void;
  update: (ref: ScopedThreadRef, patch: Partial<OrbitThreadInstance>) => void;
  remove: (ref: ScopedThreadRef) => void;
}

export const useOrbitThreadStore = create<OrbitThreadStoreState>()(
  persist(
    (set) => ({
      byThreadKey: {},
      register: (ref, instance) =>
        set((state) => ({
          byThreadKey: { ...state.byThreadKey, [scopedThreadKey(ref)]: instance },
        })),
      update: (ref, patch) =>
        set((state) => {
          const key = scopedThreadKey(ref);
          const current = state.byThreadKey[key];
          if (!current) return state;
          return { byThreadKey: { ...state.byThreadKey, [key]: { ...current, ...patch } } };
        }),
      remove: (ref) =>
        set((state) => {
          const key = scopedThreadKey(ref);
          if (!(key in state.byThreadKey)) return state;
          const { [key]: _removed, ...rest } = state.byThreadKey;
          return { byThreadKey: rest };
        }),
    }),
    {
      name: "t3code:orbit-thread-instances:v2",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byThreadKey: state.byThreadKey }),
    },
  ),
);

function findOrbitCheckout(
  byThreadKey: Record<string, OrbitThreadInstance>,
  environmentId: string,
  worktreePath: string | null,
): OrbitThreadInstance | null {
  if (worktreePath === null) return null;
  for (const instance of Object.values(byThreadKey)) {
    if (instance.environmentId === environmentId && instance.checkoutPath === worktreePath) {
      return instance;
    }
  }
  return null;
}

/** The Orbit Instance whose checkout is this folder, for any thread that works in it. */
export function useOrbitCheckout(
  environmentId: string,
  worktreePath: string | null,
): OrbitThreadInstance | null {
  return useOrbitThreadStore((state) =>
    findOrbitCheckout(state.byThreadKey, environmentId, worktreePath),
  );
}

// T3's own worktrees live under its home (`.../.t3/worktrees/<repo>/t3code-<hex>`);
// worktrees made for Orbit sit in Orbit's apps folder with the same folder name.
const ORBIT_WORKTREE_FOLDER = /[\\/]t3code-[0-9a-f]{8}$/;
const T3_WORKTREES_FOLDER = /[\\/]\.t3[\\/]worktrees[\\/]/;

/**
 * Orbit owns this folder; T3 must never run `git worktree` commands on it.
 * The folder name also counts, so another client's Orbit threads stay safe.
 */
export function isOrbitCheckout(environmentId: string, worktreePath: string | null): boolean {
  if (worktreePath === null) return false;
  const path = worktreePath.replace(/[\\/]+$/, "");
  return (
    (ORBIT_WORKTREE_FOLDER.test(path) && !T3_WORKTREES_FOLDER.test(path)) ||
    findOrbitCheckout(useOrbitThreadStore.getState().byThreadKey, environmentId, path) !== null
  );
}
