import type { OrbitGatewayWorkspace } from "./client.ts";

/**
 * Three-way merge of a profile's workspaces, used when another device replaced the settings while
 * this one had unsent edits (`conn.settings_version_conflict`).
 *
 * `base` is the list both sides started from (the last version this device read), `local` holds
 * this device's edits, and `remote` is the profile's current list. Per workspace id, a side that
 * did not change it since `base` takes the other side's version, so a deletion on one side and no
 * edit on the other removes it. When both sides changed the same workspace, the local edit wins:
 * it is the newer intent of the person in front of this device. An edit beats a deletion, so no
 * change is lost silently.
 *
 * Order follows the remote list unless only this device reordered, then the local order. New
 * workspaces from either side keep their position relative to the side that added them.
 */
export function mergeWorkspaces(
  base: readonly OrbitGatewayWorkspace[],
  local: readonly OrbitGatewayWorkspace[],
  remote: readonly OrbitGatewayWorkspace[],
): OrbitGatewayWorkspace[] {
  const baseById = byId(base);
  const localById = byId(local);
  const remoteById = byId(remote);

  const resolved = new Map<string, OrbitGatewayWorkspace>();
  for (const id of new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()])) {
    const before = baseById.get(id);
    const mine = localById.get(id);
    const theirs = remoteById.get(id);
    const chosen = sameWorkspace(mine, before)
      ? theirs
      : sameWorkspace(theirs, before)
        ? mine
        : (mine ?? theirs);
    if (chosen) resolved.set(id, chosen);
  }

  const localReordered = !sameOrder(base, local);
  const remoteReordered = !sameOrder(base, remote);
  const primary = localReordered && !remoteReordered ? local : remote;
  const secondary = primary === local ? remote : local;

  const ordered: OrbitGatewayWorkspace[] = [];
  const placed = new Set<string>();
  for (const workspace of primary) {
    const chosen = resolved.get(workspace.id);
    if (chosen && !placed.has(chosen.id)) {
      ordered.push(chosen);
      placed.add(chosen.id);
    }
  }
  // Workspaces only the other side has: insert after their nearest preceding neighbour there.
  secondary.forEach((workspace, index) => {
    const chosen = resolved.get(workspace.id);
    if (!chosen || placed.has(chosen.id)) return;
    let at = 0;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const neighbour = ordered.findIndex((entry) => entry.id === secondary[previous]!.id);
      if (neighbour !== -1) {
        at = neighbour + 1;
        break;
      }
    }
    ordered.splice(at, 0, chosen);
    placed.add(chosen.id);
  });
  return ordered;
}

/** True when two workspace lists hold the same workspaces with the same content in the same order. */
export function sameWorkspaces(
  left: readonly OrbitGatewayWorkspace[],
  right: readonly OrbitGatewayWorkspace[],
): boolean {
  return (
    left.length === right.length &&
    left.every((workspace, index) => sameWorkspace(workspace, right[index]))
  );
}

function byId(list: readonly OrbitGatewayWorkspace[]): Map<string, OrbitGatewayWorkspace> {
  return new Map(list.map((workspace) => [workspace.id, workspace]));
}

function sameOrder(
  left: readonly OrbitGatewayWorkspace[],
  right: readonly OrbitGatewayWorkspace[],
): boolean {
  const shared = new Set(left.map((workspace) => workspace.id));
  const rightShared = right.filter((workspace) => shared.has(workspace.id)).map((w) => w.id);
  const leftShared = left.map((workspace) => workspace.id).filter((id) => rightShared.includes(id));
  return leftShared.every((id, index) => id === rightShared[index]);
}

function sameWorkspace(
  left: OrbitGatewayWorkspace | undefined,
  right: OrbitGatewayWorkspace | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.color === right.color &&
    left.icon === right.icon &&
    (left.image ?? null) === (right.image ?? null) &&
    sameList(left.projectRefs, right.projectRefs) &&
    sameList(left.projectKeys, right.projectKeys)
  );
}

function sameList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
