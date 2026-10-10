import type { ProfileSectionName, ProfileSyncChannel } from "@t3tools/client-runtime/orbit-gateway";

import { saveSectionBackup, useProfileSyncBackups } from "./profileSyncStorage";

/**
 * The meeting point between the components that can read and write this device's appearance and
 * settings (they need React hooks) and the profile sync engine (which runs on a timer).
 * `OrbitAppearanceSync` registers the channels and announces local changes; `OrbitProfileSync`
 * reads the channels and schedules a sync after each announcement.
 */

let channels: readonly ProfileSyncChannel[] = [];
const changeListeners = new Set<() => void>();

export function getProfileSyncChannels(): readonly ProfileSyncChannel[] {
  return channels;
}

/** Returns the function that withdraws these channels. */
export function setProfileSyncChannels(next: readonly ProfileSyncChannel[]): () => void {
  channels = next;
  return () => {
    if (channels === next) channels = [];
  };
}

/** Something on this device that may be synced has changed; the sync debounces and decides. */
export function notifyLocalProfileChange(): void {
  for (const listener of changeListeners) listener();
}

export function onLocalProfileChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Puts back what this device had before the profile replaced it. Counts as the user's own
 * change, so the restored values replace the profile's at the next sync.
 */
export function restoreSectionBackup(name: ProfileSectionName): boolean {
  const backup = useProfileSyncBackups.getState()[name];
  const channel = channels.find((entry) => entry.name === name);
  if (!backup || !channel) return false;
  channel.applyRemote(backup.value, null);
  notifyLocalProfileChange();
  return true;
}

/** Keeps what these sections hold on this device now, before a forced pull replaces it. */
export function backupLocalSections(names: readonly ProfileSectionName[]): void {
  for (const channel of channels) {
    if (!names.includes(channel.name)) continue;
    const value = channel.readLocal(null);
    if (value !== null) saveSectionBackup(channel.name, value);
  }
}
