/**
 * Workspaces: named sets of sidebar projects, shown as a rail beside the
 * thread sidebar. Selecting one scopes the sidebar to its projects. They live
 * only in this client (localStorage); see workspaceStore.ts.
 */

export const WORKSPACE_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "blue",
  "violet",
  "pink",
] as const;
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export interface Workspace {
  readonly id: string;
  readonly name: string;
  /** Logical sidebar project keys (SidebarProjectSnapshot.projectKey). */
  readonly projectKeys: readonly string[];
  readonly color: WorkspaceColor;
  /** A name from WORKSPACE_ICON_NAMES, or null to show the name's first letter. */
  readonly icon: string | null;
}

export interface WorkspaceProject {
  readonly projectKey: string;
  readonly displayName: string;
}

/** Folds case and diacritics and keeps letters and digits, the way Rooms matches names. */
export function workspaceNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** The letter a workspace shows without an icon: the first letter or digit of its name. */
export function workspaceLetter(name: string): string {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toLocaleUpperCase() : "?";
}

/**
 * The workspace a request names, by id or by name (compared like Rooms does).
 * Null when no workspace, or more than one, matches.
 */
export function findWorkspace(
  workspaces: readonly Workspace[],
  idOrName: string,
): Workspace | null {
  const byId = workspaces.find((workspace) => workspace.id === idOrName);
  if (byId) return byId;
  const key = workspaceNameKey(idOrName);
  if (key.length === 0) return null;
  const matches = workspaces.filter((workspace) => workspaceNameKey(workspace.name) === key);
  return matches.length === 1 ? matches[0]! : null;
}

/** Words that mean "no workspace": show every project. */
export function meansAllProjects(idOrName: string): boolean {
  return ["", "all", "allprojects", "none"].includes(workspaceNameKey(idOrName));
}

/**
 * Picks a color for a new workspace: the first palette color no workspace
 * uses yet, else the palette cycles.
 */
export function nextWorkspaceColor(workspaces: readonly Workspace[]): WorkspaceColor {
  const used = new Set(workspaces.map((workspace) => workspace.color));
  return (
    WORKSPACE_COLORS.find((color) => !used.has(color)) ??
    WORKSPACE_COLORS[workspaces.length % WORKSPACE_COLORS.length]!
  );
}

/**
 * The environment-scoped project refs ("<environmentId>:<projectId>") the
 * sidebar shows, given the active workspace and the sidebar's own
 * single-project filter. Null means every project.
 */
export function resolveScopedProjectKeys<
  G extends {
    readonly projectKey: string;
    readonly memberProjectRefs: readonly {
      readonly environmentId: string;
      readonly projectId: string;
    }[];
  },
>(input: {
  readonly projectGroups: readonly G[];
  readonly workspace: Workspace | null;
  readonly scopedProjectGroup: G | null;
}): ReadonlySet<string> | null {
  const { projectGroups, workspace, scopedProjectGroup } = input;
  if (workspace === null && scopedProjectGroup === null) return null;
  const inWorkspace = workspace === null ? null : new Set<string>(workspace.projectKeys);
  const groups = (scopedProjectGroup === null ? projectGroups : [scopedProjectGroup]).filter(
    (group) => inWorkspace === null || inWorkspace.has(group.projectKey),
  );
  return new Set(
    groups.flatMap((group) =>
      group.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
    ),
  );
}

/** Trims a draft workspace; throws a readable error when it can't be saved. */
export function validateWorkspaceDraft(draft: {
  readonly name: string;
  readonly projectKeys: readonly string[];
  readonly color: string;
  readonly icon: string | null;
}): { name: string; projectKeys: string[]; color: WorkspaceColor; icon: string | null } {
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new Error("Give the workspace a name.");
  if (name.length > 40) throw new Error("Keep the name to 40 characters.");
  if (meansAllProjects(name)) throw new Error(`"${name}" is reserved for all projects.`);
  if (!WORKSPACE_COLORS.includes(draft.color as WorkspaceColor)) throw new Error("Pick a color.");
  return {
    name,
    projectKeys: [...new Set(draft.projectKeys)],
    color: draft.color as WorkspaceColor,
    icon: draft.icon,
  };
}
