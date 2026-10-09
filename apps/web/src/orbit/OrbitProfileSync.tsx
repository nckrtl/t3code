import {
  createOrbitGatewayClient,
  OrbitGatewayError,
  type OrbitGatewayClient,
  type OrbitGatewayTransport,
  type OrbitGatewayWorkspace,
} from "@t3tools/client-runtime/orbit-gateway";
import { useEffect } from "react";
import { create } from "zustand";

import { useWorkspaceStore } from "../workspaceStore";
import { WORKSPACE_COLORS, type Workspace, type WorkspaceColor } from "../workspaces.logic";
import {
  syncWorkspaceProfile,
  type WorkspaceProfileSyncPorts,
  type WorkspaceProfileSyncState,
} from "./workspaceProfileSync";

const STATE_STORAGE_KEY = "t3code:orbit-profile-sync:v1";
const POLL_MS = 30_000;
const LOCAL_EDIT_DEBOUNCE_MS = 1_500;

export interface OrbitProfileSyncStatus {
  readonly phase: "off" | "unbound" | "synced" | "error";
  readonly profileName: string | null;
  readonly error: string | null;
  readonly syncedAt: number | null;
}

/** What the profile sync last did, for Settings. */
export const useOrbitProfileSyncStatus = create<OrbitProfileSyncStatus>(() => ({
  phase: "off",
  profileName: null,
  error: null,
  syncedAt: null,
}));

/** The Gateway client over the desktop main process, or null outside the desktop app. */
export function desktopOrbitGatewayClient(): OrbitGatewayClient | null {
  const send = window.desktopBridge?.orbitGatewaySend;
  if (!send) return null;
  const transport: OrbitGatewayTransport = async (request) => {
    const response = await send({
      method: request.method,
      path: request.path,
      body: request.body === undefined ? null : JSON.stringify(request.body),
    });
    if (response.error !== null) throw new Error(response.error);
    return { status: response.status, body: response.body };
  };
  return createOrbitGatewayClient(transport);
}

function toGateway(workspace: Workspace): OrbitGatewayWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    color: workspace.color,
    icon: workspace.icon,
    image: workspace.image ?? null,
    projectRefs: [...(workspace.projectRefs ?? [])],
    projectKeys: [...workspace.projectKeys],
  };
}

function toLocal(workspace: OrbitGatewayWorkspace): Workspace {
  const color = (WORKSPACE_COLORS as readonly string[]).includes(workspace.color)
    ? (workspace.color as WorkspaceColor)
    : "slate";
  return {
    id: workspace.id,
    name: workspace.name,
    color,
    icon: workspace.icon,
    image: workspace.image ?? null,
    projectRefs: [...(workspace.projectRefs ?? [])],
    projectKeys: [...(workspace.projectKeys ?? [])],
  };
}

function loadState(): WorkspaceProfileSyncState | null {
  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as WorkspaceProfileSyncState);
  } catch {
    return null;
  }
}

function saveState(state: WorkspaceProfileSyncState | null): void {
  if (state === null) window.localStorage.removeItem(STATE_STORAGE_KEY);
  else window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
}

function writeLocal(workspaces: readonly OrbitGatewayWorkspace[]): void {
  const next = workspaces.map(toLocal);
  useWorkspaceStore.setState((state) => ({
    workspaces: next,
    activeWorkspaceId: next.some((workspace) => workspace.id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : null,
  }));
}

/**
 * Syncs the workspace list with this device's Orbit profile. Mounted once, in the main window of
 * the desktop app; extra windows follow the main window through the workspace store's storage.
 */
export function OrbitProfileSync() {
  useEffect(() => {
    const client = desktopOrbitGatewayClient();
    if (!client) return;
    const ports: WorkspaceProfileSyncPorts = {
      client,
      readLocal: () => useWorkspaceStore.getState().workspaces.map(toGateway),
      writeLocal,
      loadState,
      saveState,
    };

    let disposed = false;
    let running: Promise<void> | null = null;
    let again = false;
    const run = (): void => {
      if (disposed) return;
      if (running) {
        again = true;
        return;
      }
      running = syncWorkspaceProfile(ports)
        .then((result) => {
          useOrbitProfileSyncStatus.setState(
            result.kind === "unbound"
              ? { phase: "unbound", profileName: null, error: null, syncedAt: Date.now() }
              : {
                  phase: "synced",
                  profileName: result.profileName,
                  error: null,
                  syncedAt: Date.now(),
                },
          );
        })
        .catch((error: unknown) => {
          const message =
            error instanceof OrbitGatewayError || error instanceof Error
              ? error.message
              : String(error);
          useOrbitProfileSyncStatus.setState((status) => ({
            ...status,
            phase: "error",
            error: message,
          }));
        })
        .finally(() => {
          running = null;
          if (again) {
            again = false;
            run();
          }
        });
    };

    let editTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      if (state.workspaces === previous.workspaces) return;
      if (editTimer) clearTimeout(editTimer);
      editTimer = setTimeout(run, LOCAL_EDIT_DEBOUNCE_MS);
    });
    const interval = setInterval(run, POLL_MS);
    window.addEventListener("focus", run);
    run();

    return () => {
      disposed = true;
      unsubscribe();
      clearInterval(interval);
      if (editTimer) clearTimeout(editTimer);
      window.removeEventListener("focus", run);
    };
  }, []);
  return null;
}
