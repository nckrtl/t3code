import { describe, expect, it } from "vite-plus/test";

import { mergeOtherWindowUiState, type UiState } from "./uiStateStore";

const base: UiState = {
  projectExpandedById: { p1: true, p2: true },
  projectOrder: ["p1", "p2"],
  sidebarProjectScopeKey: "local-scope",
  threadLastVisitedAtById: { t1: "2026-09-29T10:00:00.000Z" },
  threadChangedFilesExpandedById: {},
  defaultAdvertisedEndpointKey: null,
  pullRequestMergeMethod: "merge",
};

describe("mergeOtherWindowUiState", () => {
  it("takes the other window's changes but keeps this window's project scope", () => {
    const incoming: UiState = {
      ...base,
      projectExpandedById: { p1: false, p2: true },
      projectOrder: ["p2", "p1"],
      sidebarProjectScopeKey: "other-scope",
      threadLastVisitedAtById: { t1: "2026-09-29T10:00:00.000Z", t2: "2026-09-29T11:00:00.000Z" },
    };
    const merged = mergeOtherWindowUiState(base, incoming, () => false);
    expect(merged.state).toEqual({ ...incoming, sidebarProjectScopeKey: "local-scope" });
    expect(merged.localAhead).toBe(false);
  });

  it("keeps keys changed here and reports them as newer", () => {
    const local: UiState = { ...base, projectExpandedById: { p1: true, p2: false } };
    const incoming: UiState = { ...base, projectExpandedById: { p1: false, p2: true } };
    const merged = mergeOtherWindowUiState(local, incoming, (key) => key === "e:p2");
    expect(merged.state?.projectExpandedById).toEqual({ p1: false, p2: false });
    expect(merged.localAhead).toBe(true);
  });

  it("changes nothing when only the project scope differs", () => {
    const merged = mergeOtherWindowUiState(
      base,
      { ...base, sidebarProjectScopeKey: "other" },
      () => false,
    );
    expect(merged).toEqual({ state: null, localAhead: false });
  });
});
