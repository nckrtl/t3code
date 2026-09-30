import { describe, expect, it } from "vite-plus/test";

import { planWorkspaceLink, type WorkspaceWindowClaim } from "./workspaceLink.ts";

const reported = (
  windowId: number,
  workspace: { id: string | null; name: string | null } | null,
  launchWorkspace?: string | null,
): WorkspaceWindowClaim => ({
  windowId,
  reported: workspace,
  launchWorkspace,
});

describe("planWorkspaceLink", () => {
  it("focuses the window already showing that workspace, ignoring case and accents", () => {
    const windows = [
      reported(1, { id: "ws-orbit", name: "Orbit" }),
      reported(2, { id: "ws-dlf", name: "DLF" }),
    ];
    expect(planWorkspaceLink("dlf", windows)).toEqual({ action: "focus", windowId: 2 });
    expect(
      planWorkspaceLink("Désktop Apps!", [reported(4, { id: "ws-4", name: "Desktop apps" })]),
    ).toEqual({ action: "focus", windowId: 4 });
  });

  it("focuses a window by workspace id", () => {
    expect(planWorkspaceLink("ws-dlf", [reported(2, { id: "ws-dlf", name: "DLF" })])).toEqual({
      action: "focus",
      windowId: 2,
    });
  });

  it("prefers the first matching window", () => {
    const windows = [
      reported(7, { id: "ws-dlf", name: "DLF" }),
      reported(8, { id: "ws-dlf-2", name: "DLF" }),
    ];
    expect(planWorkspaceLink("DLF", windows)).toEqual({ action: "focus", windowId: 7 });
  });

  it("uses the launch workspace until the renderer reports, and the report wins after that", () => {
    expect(planWorkspaceLink("DLF", [reported(5, null, "DLF")])).toEqual({
      action: "focus",
      windowId: 5,
    });
    expect(
      planWorkspaceLink("DLF", [reported(5, { id: "ws-orbit", name: "Orbit" }, "DLF")]),
    ).toEqual({ action: "open", workspace: "DLF" });
    expect(
      planWorkspaceLink("Orbit", [reported(5, { id: "ws-orbit", name: "Orbit" }, "DLF")]),
    ).toEqual({ action: "focus", windowId: 5 });
  });

  it("does not treat an unreported main window as a match", () => {
    expect(planWorkspaceLink("DLF", [reported(1, null)])).toEqual({
      action: "open",
      workspace: "DLF",
    });
    expect(planWorkspaceLink("all", [reported(1, null)])).toEqual({
      action: "open",
      workspace: null,
    });
  });

  it("focuses the window that is showing every project for an all-projects link", () => {
    const windows = [
      reported(1, { id: "ws-orbit", name: "Orbit" }),
      reported(3, { id: null, name: null }, null),
    ];
    expect(planWorkspaceLink("all", windows)).toEqual({ action: "focus", windowId: 3 });
    expect(planWorkspaceLink("All Projects", [reported(6, null, null)])).toEqual({
      action: "focus",
      windowId: 6,
    });
  });

  it("opens a new window when nothing shows the workspace", () => {
    expect(planWorkspaceLink("DLF", [reported(1, { id: "ws-orbit", name: "Orbit" })])).toEqual({
      action: "open",
      workspace: "DLF",
    });
    expect(planWorkspaceLink("none", [])).toEqual({ action: "open", workspace: null });
  });

  it("focuses the one workspace whose name starts with the link", () => {
    const windows = [
      reported(1, { id: "ws-orbit", name: "Orbit" }),
      reported(2, { id: "ws-dlf", name: "DLF - Leden" }),
    ];
    expect(planWorkspaceLink("DLF", windows)).toEqual({ action: "focus", windowId: 2 });
    expect(
      planWorkspaceLink("DLF", [
        reported(2, { id: "ws-dlf", name: "DLF - Leden" }),
        reported(4, { id: "ws-dlf-2", name: "DLF - Leden" }),
      ]),
    ).toEqual({ action: "focus", windowId: 2 });
    expect(
      planWorkspaceLink("DLF", [
        reported(2, { id: "ws-dlf", name: "DLF - Leden" }),
        reported(3, { id: "ws-members", name: "DLF Members" }),
      ]),
    ).toEqual({ action: "open", workspace: "DLF" });
    expect(
      planWorkspaceLink("DLF", [
        reported(9, { id: "ws-long", name: "DLF - Leden" }),
        reported(8, { id: "ws-exact", name: "DLF" }),
      ]),
    ).toEqual({ action: "focus", windowId: 8 });
  });
});
