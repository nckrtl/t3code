import {
  OrbitGatewayError,
  type OrbitGatewayEnvironment,
  type OrbitGatewayNode,
  type OrbitGatewayProfile,
} from "@t3tools/client-runtime/orbit-gateway";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback, useEffect, useMemo, useState } from "react";

import { connectPairing as connectPairingAtom } from "~/connection/onboarding";
import {
  desktopOrbitGatewayClient,
  syncOrbitProfileNow,
  useOrbitProfileSyncStatus,
} from "~/orbit/OrbitProfileSync";
import { useEnvironments } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

interface GatewayView {
  readonly node: OrbitGatewayNode;
  readonly profiles: readonly OrbitGatewayProfile[];
  readonly environments: readonly OrbitGatewayEnvironment[];
}

function message(error: unknown): string {
  return error instanceof OrbitGatewayError || error instanceof Error
    ? error.message
    : String(error);
}

function relativeTime(at: number | null): string {
  if (at === null) return "not yet";
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

/**
 * Settings › Orbit: this device's Node and profile on the Orbit Gateway, the workspace sync, and the
 * T3 servers the Gateway knows, each paired in one click. Desktop only: the Gateway calls go
 * through the main process.
 */
export function OrbitSettingsPanel() {
  const client = useMemo(() => desktopOrbitGatewayClient(), []);
  const sync = useOrbitProfileSyncStatus();
  const { environments: savedEnvironments } = useEnvironments();
  const connectPairing = useAtomCommand(connectPairingAtom, { reportFailure: false });
  const [view, setView] = useState<GatewayView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const [node, profiles, environments] = await Promise.all([
        client.me(),
        client.profiles(),
        client.environments(),
      ]);
      setView({ node, profiles, environments });
      setLoadError(null);
    } catch (error) {
      setLoadError(message(error));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toastManager.add({ type: "error", title: "Orbit", description: message(error) });
    } finally {
      setBusy(null);
    }
  };

  const bindProfile = (profile: { readonly id: number } | { readonly name: string }) =>
    run("profile", async () => {
      if (!client) return;
      const id = "id" in profile ? profile.id : (await client.createProfile(profile.name)).id;
      await client.bindProfile(id);
      setNewProfileName("");
      await load();
      syncOrbitProfileNow();
    });

  const pair = (environment: OrbitGatewayEnvironment) =>
    run(`pair:${environment.environmentId}`, async () => {
      if (!client) return;
      const pairing = await client.pair(environment.environmentId);
      const result = await connectPairing({ pairingUrl: pairing.pairingUrl });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        throw squashAtomCommandFailure(result);
      }
    });

  if (!client) {
    return (
      <SettingsPageContainer>
        <SettingsSection title="Orbit">
          <SettingsRow
            title="Available in the desktop app"
            description="The Orbit Gateway knows a device by its WireGuard address, so the desktop app calls it."
          />
        </SettingsSection>
      </SettingsPageContainer>
    );
  }

  const paired = new Set(savedEnvironments.map((environment) => String(environment.environmentId)));
  const profile = view?.node.profile ?? null;

  return (
    <SettingsPageContainer>
      <SettingsSection id={searchableSetting("orbit-device").id} title="This device">
        <SettingsRow
          title={view?.node.name ?? (loadError ? "Gateway unreachable" : "Connecting…")}
          description={
            loadError ??
            (view ? `Signed in to gateway.orbit as ${view.node.wireguardIp}` : "gateway.orbit")
          }
          control={
            <Button size="xs" variant="outline" onClick={() => void load()}>
              Reload
            </Button>
          }
        />
      </SettingsSection>

      {view ? (
        <SettingsSection id={searchableSetting("orbit-profile").id} title="Profile">
          <SettingsRow
            title="Profile"
            description="Devices with the same profile share their workspaces."
            control={
              <Select
                value={profile ? String(profile.id) : ""}
                onValueChange={(next) => {
                  const chosen = view.profiles.find((entry) => String(entry.id) === next);
                  if (chosen && chosen.id !== profile?.id) void bindProfile({ id: chosen.id });
                }}
              >
                <SelectTrigger size="sm" aria-label="Profile" disabled={busy !== null}>
                  <SelectValue>{profile?.name ?? "Choose a profile"}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {view.profiles.map((entry) => (
                    <SelectItem key={entry.id} value={String(entry.id)}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title="New profile"
            description="Creates a profile and switches this device to it."
            control={
              <div className="flex items-center gap-2">
                <Input
                  aria-label="New profile name"
                  placeholder="Name"
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                />
                <Button
                  size="xs"
                  variant="outline"
                  disabled={newProfileName.trim() === "" || busy !== null}
                  onClick={() => void bindProfile({ name: newProfileName.trim() })}
                >
                  Create
                </Button>
              </div>
            }
          />
          <SettingsRow
            id={searchableSetting("orbit-workspace-sync").id}
            title="Workspace sync"
            description={
              sync.phase === "error"
                ? `Sync failed: ${sync.error}`
                : sync.phase === "synced"
                  ? `Workspaces sync with ${sync.profileName}. Last synced ${relativeTime(sync.syncedAt)}.`
                  : profile
                    ? "Waiting for the first sync."
                    : "Choose a profile to sync workspaces."
            }
            control={
              <Button
                size="xs"
                variant="outline"
                disabled={!profile}
                onClick={() => syncOrbitProfileNow()}
              >
                Sync now
              </Button>
            }
          />
        </SettingsSection>
      ) : null}

      {view ? (
        <SettingsSection id={searchableSetting("orbit-servers").id} title="Servers">
          {view.environments.length === 0 ? (
            <SettingsRow
              title="No servers registered"
              description="T3 servers register themselves with the Gateway."
            />
          ) : (
            view.environments.map((environment) => {
              const isPaired = paired.has(environment.environmentId);
              const key = `pair:${environment.environmentId}`;
              return (
                <SettingsRow
                  key={environment.environmentId}
                  title={environment.label}
                  description={
                    environment.status === "session_expired"
                      ? "Registration expired"
                      : environment.url.replace(/^https?:\/\//, "")
                  }
                  control={
                    isPaired ? (
                      <span className="text-ui text-muted-foreground">Paired</span>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busy !== null || environment.status !== "registered"}
                        onClick={() => void pair(environment)}
                      >
                        {busy === key ? "Pairing…" : "Pair"}
                      </Button>
                    )
                  }
                />
              );
            })
          )}
        </SettingsSection>
      ) : null}
    </SettingsPageContainer>
  );
}
