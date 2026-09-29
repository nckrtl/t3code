import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
              project.refs.join() === projects[index]!.refs.join(),
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
      name: "t3code:workspaces:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    },
  ),
);

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
