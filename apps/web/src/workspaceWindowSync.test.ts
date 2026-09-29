import { describe, expect, it } from "vite-plus/test";

import { keepStoredSelection } from "./workspaceStore";

describe("keepStoredSelection", () => {
  it("writes the stored selection back instead of the extra window's", () => {
    const stored = JSON.stringify({
      state: { workspaces: [], activeWorkspaceId: "ws-main" },
      version: 1,
    });
    const next = JSON.stringify({
      state: { workspaces: [{ id: "ws-new" }], activeWorkspaceId: "ws-extra" },
      version: 1,
    });
    expect(JSON.parse(keepStoredSelection(stored, next))).toEqual({
      state: { workspaces: [{ id: "ws-new" }], activeWorkspaceId: "ws-main" },
      version: 1,
    });
  });

  it("writes no selection when nothing is stored", () => {
    const next = JSON.stringify({
      state: { workspaces: [], activeWorkspaceId: "ws-extra" },
      version: 1,
    });
    expect(JSON.parse(keepStoredSelection(null, next)).state.activeWorkspaceId).toBeNull();
  });
});
