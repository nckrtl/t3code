import type { EnvironmentId } from "@t3tools/contracts";

/**
 * This window's automation host id per environment. The browser's key menu
 * sends it so the server fills only into the window the user clicked in.
 */
const hostClientIds = new Map<EnvironmentId, string>();

export function registerPreviewAutomationClientId(
  environmentId: EnvironmentId,
  clientId: string,
): () => void {
  hostClientIds.set(environmentId, clientId);
  return () => {
    if (hostClientIds.get(environmentId) === clientId) hostClientIds.delete(environmentId);
  };
}

export function readPreviewAutomationClientId(environmentId: EnvironmentId): string | null {
  return hostClientIds.get(environmentId) ?? null;
}

export function createPreviewAutomationClientId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `preview-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
