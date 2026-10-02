import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { onOtherWindowStorageChange } from "../lib/desktopWindowContext";
import { resolveStorage } from "../lib/storage";

const STORAGE_KEY = "t3code:annotation-watch:v1";

interface AnnotationWatchState {
  /** Threads in Watch mode and the annotator each one follows. */
  watchingByThreadKey: Record<string, { annotationsUrl: string }>;
  /** Annotations the last Send or Watch prompt named, per thread. */
  lastSentIdsByThreadKey: Record<string, string[]>;
  setWatching: (threadKey: string, annotationsUrl: string | null) => void;
  markSent: (threadKey: string, ids: ReadonlyArray<string>) => void;
}

export const useAnnotationWatchStore = create<AnnotationWatchState>()(
  persist(
    (set) => ({
      watchingByThreadKey: {},
      lastSentIdsByThreadKey: {},
      setWatching: (threadKey, annotationsUrl) =>
        set((state) => {
          const watchingByThreadKey = { ...state.watchingByThreadKey };
          if (annotationsUrl === null) delete watchingByThreadKey[threadKey];
          else watchingByThreadKey[threadKey] = { annotationsUrl };
          return { watchingByThreadKey };
        }),
      markSent: (threadKey, ids) =>
        set((state) => ({
          lastSentIdsByThreadKey: { ...state.lastSentIdsByThreadKey, [threadKey]: [...ids] },
        })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
    },
  ),
);

// Extra windows toggle Watch too; the main window, which sends, picks the change up.
onOtherWindowStorageChange(STORAGE_KEY, () => {
  void useAnnotationWatchStore.persist.rehydrate();
});

export function useAnnotationWatch(threadKey: string): { annotationsUrl: string } | null {
  return useAnnotationWatchStore((state) => state.watchingByThreadKey[threadKey] ?? null);
}
