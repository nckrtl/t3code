import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import {
  isAdditionalDesktopWindow,
  onOtherWindowStorageChange,
  readDesktopWindowContext,
} from "./lib/desktopWindowContext";
import { resolveStorage } from "./lib/storage";
import { randomUUID } from "./lib/utils";
import {
  findWorkspace,
  meansAllProjects,
  validateWorkspaceDraft,
  workspaceNameKey,
  workspaceProjectRefs,
  type Workspace,
  type WorkspaceProject,
} from "./workspaces.logic";

export type WorkspaceDraft = Omit<Workspace, "id">;

interface WorkspaceStoreState {
  workspaces: Workspace[];
  /** The selected workspace; null shows every project. */
  activeWorkspaceId: string | null;
  /** The sidebar's projects, published by the thread sidebar (not persisted). */
  availableProjects: readonly WorkspaceProject[];
  publishProjects: (projects: readonly WorkspaceProject[]) => void;
  selectWorkspace: (id: string | null) => void;
  /** Selects by id or name ("all" clears); returns the workspace, or null for all projects. */
  selectWorkspaceByName: (idOrName: string) => { found: boolean; workspace: Workspace | null };
  createWorkspace: (draft: WorkspaceDraft) => Workspace;
  updateWorkspace: (id: string, draft: WorkspaceDraft) => void;
  deleteWorkspace: (id: string) => void;
}

function assertUniqueName(workspaces: readonly Workspace[], name: string, exceptId?: string) {
  const key = workspaceNameKey(name);
  if (workspaces.some((w) => w.id !== exceptId && workspaceNameKey(w.name) === key)) {
    throw new Error(`A workspace named "${name}" already exists.`);
  }
}

function newWorkspaceId(): string {
  return `ws-${randomUUID()}`;
}

export const WORKSPACE_STORAGE_KEY = "t3code:workspaces:v1";

/**
 * The stored selection belongs to the main window. An extra window keeps its
 * selection in memory and writes back the stored one unchanged.
 */
export function keepStoredSelection(stored: string | null, next: string): string {
  try {
    const nextValue = JSON.parse(next) as { state?: Record<string, unknown> };
    const storedValue = stored === null ? null : (JSON.parse(stored) as typeof nextValue);
    if (nextValue.state === undefined) return next;
    nextValue.state.activeWorkspaceId = storedValue?.state?.activeWorkspaceId ?? null;
    return JSON.stringify(nextValue);
  } catch {
    return next;
  }
}

function workspaceStorage(): StateStorage {
  const base = resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
  if (!isAdditionalDesktopWindow()) return base;
  return {
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      const stored = base.getItem(name);
      return base.setItem(
        name,
        keepStoredSelection(typeof stored === "string" ? stored : null, value),
      );
    },
    removeItem: (name) => base.removeItem(name),
  };
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      availableProjects: [],
      publishProjects: (projects) => {
        const current = get().availableProjects;
        const same =
          current.length === projects.length &&
          current.every(
            (project, index) =>
              project.projectKey === projects[index]!.projectKey &&
              project.displayName === projects[index]!.displayName &&
              project.refs.join() === projects[index]!.refs.join() &&
              JSON.stringify(project.connections) === JSON.stringify(projects[index]!.connections),
          );
        if (!same) set({ availableProjects: projects });
      },
      selectWorkspace: (id) =>
        set((state) => ({
          activeWorkspaceId:
            id !== null && state.workspaces.some((workspace) => workspace.id === id) ? id : null,
        })),
      selectWorkspaceByName: (idOrName) => {
        if (meansAllProjects(idOrName)) {
          set({ activeWorkspaceId: null });
          return { found: true, workspace: null };
        }
        const workspace = findWorkspace(get().workspaces, idOrName);
        if (workspace === null) return { found: false, workspace: null };
        set({ activeWorkspaceId: workspace.id });
        return { found: true, workspace };
      },
      createWorkspace: (draft) => {
        const valid = validateWorkspaceDraft(draft);
        assertUniqueName(get().workspaces, valid.name);
        const workspace: Workspace = { id: newWorkspaceId(), ...valid };
        set((state) => ({ workspaces: [...state.workspaces, workspace] }));
        return workspace;
      },
      updateWorkspace: (id, draft) => {
        const valid = validateWorkspaceDraft(draft);
        assertUniqueName(get().workspaces, valid.name, id);
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, ...valid } : workspace,
          ),
        }));
      },
      deleteWorkspace: (id) =>
        set((state) => ({
          workspaces: state.workspaces.filter((workspace) => workspace.id !== id),
          activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
        })),
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(workspaceStorage),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<
          Pick<WorkspaceStoreState, "workspaces" | "activeWorkspaceId">
        >;
        const workspaces = Array.isArray(stored.workspaces)
          ? stored.workspaces
          : current.workspaces;
        const activeWorkspaceId = isAdditionalDesktopWindow()
          ? current.activeWorkspaceId
          : (stored.activeWorkspaceId ?? null);
        return {
          ...current,
          workspaces,
          activeWorkspaceId: workspaces.some((workspace) => workspace.id === activeWorkspaceId)
            ? activeWorkspaceId
            : null,
        };
      },
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    },
  ),
);

// rooms-patches: an extra window starts on the workspace it was opened for,
// and every window picks up workspace edits made in the others.
{
  const context = readDesktopWindowContext();
  if (context.additional && context.workspace !== null) {
    useWorkspaceStore.getState().selectWorkspaceByName(context.workspace);
  }
  onOtherWindowStorageChange(WORKSPACE_STORAGE_KEY, () => {
    void useWorkspaceStore.persist.rehydrate();
  });
}

/** The selected workspace, or null for all projects. */
export function useActiveWorkspace(): Workspace | null {
  return useWorkspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null,
  );
}

/**
 * The project refs ("<environmentId>:<projectId>") new threads may use while a
 * workspace is selected; null means every project.
 */
export function useActiveWorkspaceProjectRefs(): ReadonlySet<string> | null {
  const workspace = useActiveWorkspace();
  const projects = useWorkspaceStore((state) => state.availableProjects);
  return useMemo(() => workspaceProjectRefs(workspace, projects), [workspace, projects]);
}
