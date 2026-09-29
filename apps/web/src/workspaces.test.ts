import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useWorkspaceStore } from "./workspaceStore";
import {
  groupProjectsByConnection,
  findWorkspace,
  nextWorkspaceColor,
  resolveScopedProjectKeys,
  validateWorkspaceDraft,
  workspaceLetter,
  workspaceNameKey,
  workspaceProjectRefs,
  type Workspace,
} from "./workspaces.logic";

const group = (projectKey: string, ...refs: [string, string][]) => ({
  projectKey,
  memberProjectRefs: refs.map(([environmentId, projectId]) => ({ environmentId, projectId })),
});
const orbit = group("repo:orbit", ["local", "p1"], ["beast", "p9"]);
const drift = group("repo:drift", ["local", "p2"]);
const rooms = group("repo:rooms", ["local", "p3"]);
const workspace = (name: string, projectKeys: string[], id = `ws-${name}`): Workspace => ({
  id,
  name,
  projectKeys,
  color: "blue",
  icon: null,
});

describe("workspaces.logic", () => {
  it("shows a workspace's first letter or digit", () => {
    expect(workspaceLetter("orbit")).toBe("O");
    expect(workspaceLetter("  (3d) apps")).toBe("3");
    expect(workspaceLetter("émigré")).toBe("É");
    expect(workspaceLetter("—")).toBe("?");
  });

  it("finds workspaces by id or by name the way Rooms compares names", () => {
    const all = [workspace("Orbit", []), workspace("Desktop apps", [])];
    expect(findWorkspace(all, "ws-Orbit")?.name).toBe("Orbit");
    expect(findWorkspace(all, "orbit")?.name).toBe("Orbit");
    expect(findWorkspace(all, "desktop-apps")?.name).toBe("Desktop apps");
    expect(findWorkspace(all, "missing")).toBeNull();
    expect(findWorkspace([...all, workspace("ORBIT", [], "ws-2")], "orbit")).toBeNull();
    expect(workspaceNameKey("Désktop Apps!")).toBe("desktopapps");
  });

  it("scopes the sidebar to the workspace's projects, across environments", () => {
    const groups = [orbit, drift, rooms];
    expect(
      resolveScopedProjectKeys({
        projectGroups: groups,
        workspace: null,
        scopedProjectGroup: null,
      }),
    ).toBeNull();
    expect(
      resolveScopedProjectKeys({
        projectGroups: groups,
        workspace: workspace("Desktop", ["repo:drift", "repo:rooms", "repo:gone"]),
        scopedProjectGroup: null,
      }),
    ).toEqual(new Set(["local:p2", "local:p3"]));
    expect(
      resolveScopedProjectKeys({
        projectGroups: groups,
        workspace: null,
        scopedProjectGroup: orbit,
      }),
    ).toEqual(new Set(["local:p1", "beast:p9"]));
  });

  it("narrows a workspace further by the sidebar's project filter, never widens it", () => {
    const desktop = workspace("Desktop", ["repo:drift", "repo:rooms"]);
    expect(
      resolveScopedProjectKeys({
        projectGroups: [orbit, drift, rooms],
        workspace: desktop,
        scopedProjectGroup: drift,
      }),
    ).toEqual(new Set(["local:p2"]));
    expect(
      resolveScopedProjectKeys({
        projectGroups: [orbit, drift, rooms],
        workspace: desktop,
        scopedProjectGroup: orbit,
      }),
    ).toEqual(new Set());
    expect(
      resolveScopedProjectKeys({
        projectGroups: [orbit],
        workspace: workspace("Empty", []),
        scopedProjectGroup: null,
      }),
    ).toEqual(new Set());
  });

  it("validates drafts", () => {
    expect(
      validateWorkspaceDraft({
        name: "  Desktop   apps ",
        projectKeys: ["a", "a", "b"],
        color: "teal",
        icon: null,
      }),
    ).toEqual({
      name: "Desktop apps",
      projectKeys: ["a", "b"],
      color: "teal",
      icon: null,
    });
    expect(() =>
      validateWorkspaceDraft({ name: " ", projectKeys: [], color: "teal", icon: null }),
    ).toThrow("name");
    expect(() =>
      validateWorkspaceDraft({ name: "All", projectKeys: [], color: "teal", icon: null }),
    ).toThrow("reserved");
    expect(() =>
      validateWorkspaceDraft({ name: "x", projectKeys: [], color: "purple", icon: null }),
    ).toThrow("color");
  });

  it("gives new workspaces an unused color first", () => {
    expect(nextWorkspaceColor([])).toBe("slate");
    expect(nextWorkspaceColor([{ ...workspace("a", []), color: "slate" }])).toBe("red");
  });
});

describe("workspaceProjectRefs", () => {
  it("lists the refs new threads may use in a workspace", () => {
    const projects = [
      { projectKey: "repo:orbit", displayName: "orbit", refs: ["local:p1", "beast:p9"] },
      { projectKey: "repo:drift", displayName: "drift", refs: ["local:p2"] },
    ];
    expect(workspaceProjectRefs(null, projects)).toBeNull();
    expect(workspaceProjectRefs(workspace("Orbit", ["repo:orbit"]), projects)).toEqual(
      new Set(["local:p1", "beast:p9"]),
    );
    expect(workspaceProjectRefs(workspace("Empty", []), projects)).toEqual(new Set());
  });
});

describe("workspaceStore", () => {
  beforeEach(() =>
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null, availableProjects: [] }),
  );

  it("creates, selects by name, renames and deletes workspaces", () => {
    const store = useWorkspaceStore.getState();
    const created = store.createWorkspace({
      name: "Orbit",
      projectKeys: ["repo:orbit"],
      color: "blue",
      icon: null,
    });
    expect(useWorkspaceStore.getState().selectWorkspaceByName("orbit")).toEqual({
      found: true,
      workspace: created,
    });
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(created.id);

    expect(() =>
      store.createWorkspace({ name: "ORBIT", projectKeys: [], color: "red", icon: null }),
    ).toThrow("already exists");
    useWorkspaceStore.getState().updateWorkspace(created.id, {
      name: "Orbit HQ",
      projectKeys: [],
      color: "red",
      icon: "rocket",
    });
    expect(useWorkspaceStore.getState().workspaces[0]).toMatchObject({
      name: "Orbit HQ",
      color: "red",
      icon: "rocket",
    });

    expect(useWorkspaceStore.getState().selectWorkspaceByName("nope")).toEqual({
      found: false,
      workspace: null,
    });
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(created.id);
    expect(useWorkspaceStore.getState().selectWorkspaceByName("all")).toEqual({
      found: true,
      workspace: null,
    });
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();

    useWorkspaceStore.getState().selectWorkspace(created.id);
    useWorkspaceStore.getState().deleteWorkspace(created.id);
    expect(useWorkspaceStore.getState()).toMatchObject({ workspaces: [], activeWorkspaceId: null });
  });

  it("ignores selecting an unknown workspace id", () => {
    useWorkspaceStore.getState().selectWorkspace("ws-unknown");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });

  it("publishes the sidebar's projects only when they change", () => {
    const projects = [{ projectKey: "repo:orbit", displayName: "orbit", refs: ["local:p1"] }];
    useWorkspaceStore.getState().publishProjects(projects);
    const first = useWorkspaceStore.getState().availableProjects;
    useWorkspaceStore
      .getState()
      .publishProjects([{ projectKey: "repo:orbit", displayName: "orbit", refs: ["local:p1"] }]);
    expect(useWorkspaceStore.getState().availableProjects).toBe(first);
  });
});

describe("groupProjectsByConnection", () => {
  const here = {
    environmentId: "env-here",
    label: "mini",
    kind: "desktop",
    primary: true,
  } as const;
  const beast = {
    environmentId: "env-beast",
    label: "beast",
    kind: "server",
    primary: false,
  } as const;
  const alpha = {
    environmentId: "env-alpha",
    label: "alpha",
    kind: "server",
    primary: false,
  } as const;
  const project = (
    projectKey: string,
    connections: readonly (typeof here | typeof beast | typeof alpha)[],
  ) => ({
    projectKey,
    displayName: projectKey,
    refs: [],
    connections,
  });

  it("lists this machine first, then other connections by name, then unknown projects", () => {
    const sections = groupProjectsByConnection([
      project("rooms", [beast]),
      project("drift", [here, beast]),
      project("t3code", [here]),
      project("orbit", [alpha]),
      { projectKey: "gone", displayName: "gone", refs: [] },
    ]);
    expect(
      sections.map((section) => [
        section.connection?.label ?? null,
        section.projects.map((p) => p.projectKey),
      ]),
    ).toEqual([
      ["mini", ["drift", "t3code"]],
      ["alpha", ["orbit"]],
      ["beast", ["rooms", "drift"]],
      [null, ["gone"]],
    ]);
  });
});
