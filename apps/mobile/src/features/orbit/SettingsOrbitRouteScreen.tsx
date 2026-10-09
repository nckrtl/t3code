import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import {
  useRemoteConnections,
  useSavedRemoteConnections,
} from "../../state/use-remote-environment-registry";
import { ConnectionSheetButton } from "../connection/ConnectionSheetButton";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsSection } from "../settings/components/SettingsSection";
import {
  chooseOrbitProfile,
  orbitPairingUrl,
  refreshOrbitGateway,
  useOrbitGateway,
} from "./orbitGatewayStore";

/**
 * Settings › Orbit: this device's profile on the Orbit Gateway, the profile's workspaces, and the
 * T3 servers the Gateway knows, each paired in one tap. Manual environments keep working beside it.
 */
export function SettingsOrbitRouteScreen() {
  const insets = useSafeAreaInsets();
  const gateway = useOrbitGateway();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const { onConnectPress } = useRemoteConnections();
  const [newProfileName, setNewProfileName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const paired = new Set(
    Object.values(savedConnectionsById).map((entry) => String(entry.environmentId)),
  );
  const profile = gateway.node?.profile ?? null;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const pair = (environmentId: string) =>
    run(`pair:${environmentId}`, async () => {
      const result = await onConnectPress(await orbitPairingUrl(environmentId));
      if (AsyncResult.isFailure(result))
        throw new Error("Pairing failed. See Environments for details.");
    });

  return (
    <SettingsScreen title="Orbit">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {gateway.error || actionError ? (
          <ErrorBanner message={actionError ?? gateway.error ?? ""} />
        ) : null}

        <SettingsSection title="This device">
          <View className="flex-row items-center gap-4 p-4">
            <SymbolView name="person.crop.circle" size={22} tintColorClassName="accent-icon" />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-lg text-foreground">
                {gateway.node?.name ??
                  (gateway.phase === "error" ? "Gateway unreachable" : "Connecting…")}
              </Text>
              <Text className="text-sm text-foreground-muted">
                {gateway.node
                  ? `Signed in to gateway.orbit as ${gateway.node.wireguardIp}`
                  : "gateway.orbit, over WireGuard"}
              </Text>
            </View>
            {gateway.phase === "loading" ? (
              <ActivityIndicator />
            ) : (
              <Pressable accessibilityLabel="Reload" onPress={() => void refreshOrbitGateway()}>
                <SymbolView name="arrow.clockwise" size={18} tintColorClassName="accent-icon" />
              </Pressable>
            )}
          </View>
        </SettingsSection>

        {gateway.node ? (
          <SettingsSection title="Profile">
            {gateway.profiles.map((entry, index) => (
              <Pressable
                key={entry.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: profile?.id === entry.id, disabled: busy !== null }}
                disabled={busy !== null}
                onPress={() =>
                  void run(`profile:${entry.id}`, () => chooseOrbitProfile({ id: entry.id }))
                }
                className={
                  index === 0
                    ? "flex-row items-center gap-4 p-4"
                    : "flex-row items-center gap-4 border-t border-border-subtle p-4"
                }
              >
                <Text className="min-w-0 flex-1 text-lg text-foreground">{entry.name}</Text>
                {busy === `profile:${entry.id}` ? (
                  <ActivityIndicator />
                ) : profile?.id === entry.id ? (
                  <SymbolView name="checkmark" size={18} tintColorClassName="accent-icon" />
                ) : null}
              </Pressable>
            ))}
            <View
              className={
                gateway.profiles.length === 0
                  ? "flex-row items-center gap-3 p-4"
                  : "flex-row items-center gap-3 border-t border-border-subtle p-4"
              }
            >
              <TextInput
                accessibilityLabel="New profile name"
                autoCapitalize="words"
                className="min-w-0 flex-1 text-lg text-foreground"
                onChangeText={setNewProfileName}
                placeholder="New profile"
                returnKeyType="done"
                value={newProfileName}
              />
              <ConnectionSheetButton
                compact
                disabled={newProfileName.trim() === "" || busy !== null}
                icon="plus"
                label="Create"
                onPress={() =>
                  void run("profile:new", async () => {
                    await chooseOrbitProfile({ name: newProfileName.trim() });
                    setNewProfileName("");
                  })
                }
              />
            </View>
          </SettingsSection>
        ) : null}

        {profile ? (
          <SettingsSection title={`${profile.name}'s workspaces`}>
            {gateway.workspaces.length === 0 ? (
              <Text className="p-4 text-sm text-foreground-muted">
                No workspaces yet. Create them in T3 Code on the desktop.
              </Text>
            ) : (
              gateway.workspaces.map((workspace, index) => (
                <View
                  key={workspace.id}
                  className={
                    index === 0
                      ? "flex-row items-center gap-4 p-4"
                      : "flex-row items-center gap-4 border-t border-border-subtle p-4"
                  }
                >
                  <Text className="min-w-0 flex-1 text-lg text-foreground">{workspace.name}</Text>
                  <Text className="text-sm text-foreground-muted">
                    {(workspace.projectRefs?.length ?? 0) === 1
                      ? "1 project"
                      : `${workspace.projectRefs?.length ?? 0} projects`}
                  </Text>
                </View>
              ))
            )}
          </SettingsSection>
        ) : null}

        {gateway.node ? (
          <SettingsSection title="Servers">
            {gateway.environments.map((environment, index) => {
              const isPaired = paired.has(environment.environmentId);
              const key = `pair:${environment.environmentId}`;
              return (
                <View
                  key={environment.environmentId}
                  className={
                    index === 0
                      ? "flex-row items-center gap-4 p-4"
                      : "flex-row items-center gap-4 border-t border-border-subtle p-4"
                  }
                >
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-lg text-foreground">{environment.label}</Text>
                    <Text className="text-sm text-foreground-muted">
                      {environment.status === "session_expired"
                        ? "Registration expired"
                        : environment.url.replace(/^https?:\/\//, "")}
                    </Text>
                  </View>
                  {isPaired ? (
                    <Text className="text-sm text-foreground-muted">Paired</Text>
                  ) : busy === key ? (
                    <ActivityIndicator />
                  ) : (
                    <ConnectionSheetButton
                      compact
                      disabled={busy !== null || environment.status !== "registered"}
                      icon="link"
                      label="Pair"
                      onPress={() => void pair(environment.environmentId)}
                    />
                  )}
                </View>
              );
            })}
          </SettingsSection>
        ) : null}
      </ScrollView>
    </SettingsScreen>
  );
}
