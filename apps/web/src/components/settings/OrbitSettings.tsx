import {
  OrbitGatewayError,
  type EnvironmentProvider,
  type OrbitGatewayEnvironment,
  type OrbitGatewayNode,
  type OrbitGatewayProfile,
} from "@t3tools/client-runtime/orbit-gateway";
import { useCallback, useEffect, useMemo, useState } from "react";

import { setEnvironmentProvider, useEnvironmentProvider } from "~/orbit/environmentProvider";
import {
  desktopOrbitGatewayClient,
  syncOrbitProfileNow,
  useOrbitProfileSyncStatus,
} from "~/orbit/OrbitProfileSync";
import { useEnvironments } from "~/state/environments";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

interface GatewayView {
  readonly node: OrbitGatewayNode;
  readonly profiles: readonly OrbitGatewayProfile[];
  readonly environments: readonly OrbitGatewayEnvironment[];
}

const PROVIDER_LABELS: Record<EnvironmentProvider, string> = {
  default: "Default",
  orbit: "Orbit",
};

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
 * Where this device's environments come from: the ones added here (Default) or the T3 servers on
 * the Orbit Gateway (Orbit). Only the desktop app can reach the Gateway, so a browser never offers
 * Orbit.
 */
export function EnvironmentProviderSection() {
  const provider = useEnvironmentProvider((state) => state.provider);
  const orbitAvailable = useMemo(() => desktopOrbitGatewayClient() !== null, []);
  if (!orbitAvailable && provider === "default") return null;

  return (
    <SettingsSection {...searchableSetting("environment-provider")}>
      <SettingsRow
        title="Environments from"
        description={
          provider === "orbit"
            ? "The T3 servers registered on the Orbit Gateway, paired automatically. Environments added here are switched off until you choose Default again."
            : "Environments you add on this device. Orbit uses the servers on the Orbit Gateway instead and syncs workspaces with your profile."
        }
        control={
          <Select
            value={provider}
            onValueChange={(next) => {
              if (next === "default" || next === "orbit") setEnvironmentProvider(next);
            }}
          >
            <SelectTrigger size="sm" aria-label="Environments from">
              <SelectValue>{PROVIDER_LABELS[provider]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="default">{PROVIDER_LABELS.default}</SelectItem>
              {orbitAvailable ? (
                <SelectItem value="orbit">{PROVIDER_LABELS.orbit}</SelectItem>
              ) : null}
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}

/**
 * The Orbit side of Connections: this device's Node and profile on the Gateway, the workspace sync,
 * and the Gateway's T3 servers. Workspaces are edited on the desktop; pairing is automatic.
 */
export function OrbitEnvironmentSections() {
  const client = useMemo(() => desktopOrbitGatewayClient(), []);
  const sync = useOrbitProfileSyncStatus();
  const { environments: savedEnvironments } = useEnvironments();
  const [view, setView] = useState<GatewayView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [busy, setBusy] = useState(false);

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
  }, [load, sync.syncedAt]);

  const bindProfile = async (profile: { readonly id: number } | { readonly name: string }) => {
    if (!client) return;
    setBusy(true);
    try {
      const id = "id" in profile ? profile.id : (await client.createProfile(profile.name)).id;
      await client.bindProfile(id);
      setNewProfileName("");
      await load();
      syncOrbitProfileNow();
    } catch (error) {
      toastManager.add({ type: "error", title: "Orbit", description: message(error) });
    } finally {
      setBusy(false);
    }
  };

  const connected = new Set(
    savedEnvironments.map((environment) => String(environment.environmentId)),
  );
  const profile = view?.node.profile ?? null;

  return (
    <>
      <SettingsSection {...searchableSetting("orbit-device")}>
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
        <SettingsSection {...searchableSetting("orbit-profile")}>
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
                <SelectTrigger size="sm" aria-label="Profile" disabled={busy}>
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
                  disabled={newProfileName.trim() === "" || busy}
                  onClick={() => void bindProfile({ name: newProfileName.trim() })}
                >
                  Create
                </Button>
              </div>
            }
          />
          <SettingsRow
            {...searchableSetting("orbit-workspace-sync")}
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
        <SettingsSection {...searchableSetting("orbit-servers")}>
          {view.environments.length === 0 ? (
            <SettingsRow
              title="No servers registered"
              description="T3 servers register themselves with the Gateway."
            />
          ) : (
            view.environments.map((environment) => (
              <SettingsRow
                key={environment.environmentId}
                title={environment.label}
                description={environment.url.replace(/^https?:\/\//, "")}
                control={
                  <span className="text-ui text-muted-foreground">
                    {environment.status === "session_expired"
                      ? "Registration expired"
                      : connected.has(environment.environmentId)
                        ? "Paired"
                        : "Pairing…"}
                  </span>
                }
              />
            ))
          )}
        </SettingsSection>
      ) : null}
    </>
  );
}
