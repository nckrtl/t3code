import {
  createOrbitGatewayClient,
  DEFAULT_ORBIT_GATEWAY_URL,
  OrbitGatewayError,
  type OrbitGatewayEnvironment,
  type OrbitGatewayNode,
  type OrbitGatewayProfile,
  type OrbitGatewayWorkspace,
} from "@t3tools/client-runtime/orbit-gateway";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

/**
 * The phone's view of the Orbit Gateway: this device's Node and profile, the profile's workspaces,
 * and the registered T3 servers. The Gateway knows the phone by its WireGuard address, so the
 * calls carry no credentials. Workspaces are read-only here; the desktop edits them.
 */

export interface OrbitGatewayState {
  readonly phase: "idle" | "loading" | "ready" | "error";
  readonly node: OrbitGatewayNode | null;
  readonly profiles: readonly OrbitGatewayProfile[];
  readonly environments: readonly OrbitGatewayEnvironment[];
  readonly workspaces: readonly OrbitGatewayWorkspace[];
  readonly error: string | null;
  /** The workspace the thread list is scoped to on this device, or null for all projects. */
  readonly selectedWorkspaceId: string | null;
}

const client = createOrbitGatewayClient(async (request) => {
  const response = await fetch(`${DEFAULT_ORBIT_GATEWAY_URL}/api/v1/t3${request.path}`, {
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
  return { status: response.status, body: await response.text() };
});

let state: OrbitGatewayState = {
  phase: "idle",
  node: null,
  profiles: [],
  environments: [],
  workspaces: [],
  error: null,
  selectedWorkspaceId: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<OrbitGatewayState>): void {
  state = { ...state, ...patch };
  if (
    state.selectedWorkspaceId !== null &&
    !state.workspaces.some((workspace) => workspace.id === state.selectedWorkspaceId)
  ) {
    state = { ...state, selectedWorkspaceId: null };
  }
  for (const listener of listeners) listener();
}

function message(error: unknown): string {
  return error instanceof OrbitGatewayError || error instanceof Error
    ? error.message
    : String(error);
}

let refreshing: Promise<void> | null = null;

/** Reads the node, profiles, servers, and the bound profile's workspaces. */
export function refreshOrbitGateway(): Promise<void> {
  if (refreshing) return refreshing;
  set({ phase: "loading", error: null });
  refreshing = (async () => {
    try {
      const [node, profiles, environments] = await Promise.all([
        client.me(),
        client.profiles(),
        client.environments(),
      ]);
      const workspaces = node.profile ? (await client.settings(node.profile.id)).workspaces : [];
      set({ phase: "ready", node, profiles, environments, workspaces });
    } catch (error) {
      set({ phase: "error", error: message(error) });
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Binds this device to a profile, creating it first when `profile` is a new name. */
export async function chooseOrbitProfile(
  profile: { readonly id: number } | { readonly name: string },
): Promise<void> {
  try {
    const id = "id" in profile ? profile.id : (await client.createProfile(profile.name)).id;
    await client.bindProfile(id);
  } catch (error) {
    set({ error: message(error) });
    throw error;
  }
  await refreshOrbitGateway();
}

/** A one-time pairing link from the Gateway to the server, for this device. */
export function orbitPairingUrl(environmentId: string): Promise<string> {
  return client.pair(environmentId).then((pairing) => pairing.pairingUrl);
}

export function selectOrbitWorkspace(workspaceId: string | null): void {
  set({ selectedWorkspaceId: workspaceId });
}

/** The selected workspace's projects as environment-scoped refs, or null without a selection. */
export function selectedWorkspaceProjectRefs(
  current: OrbitGatewayState,
): ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly projectId: ProjectId }> | null {
  const workspace = current.workspaces.find((entry) => entry.id === current.selectedWorkspaceId);
  if (!workspace) return null;
  return (workspace.projectRefs ?? []).flatMap((ref) => {
    const at = ref.indexOf(":");
    return at > 0
      ? [
          {
            environmentId: ref.slice(0, at) as EnvironmentId,
            projectId: ref.slice(at + 1) as ProjectId,
          },
        ]
      : [];
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let started = false;

/** The Gateway state. The first use loads it, and it reloads whenever the app comes to the front. */
export function useOrbitGateway(): OrbitGatewayState {
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshOrbitGateway();
    AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshOrbitGateway();
    });
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}
