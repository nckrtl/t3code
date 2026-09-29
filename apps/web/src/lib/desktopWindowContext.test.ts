import { describe, expect, it } from "vite-plus/test";

import {
  diffIncomingRecord,
  markChangedRecordKeys,
  RecentKeyChanges,
} from "./desktopWindowContext";

describe("RecentKeyChanges", () => {
  it("forgets a change after its window", () => {
    let now = 1_000;
    const changes = new RecentKeyChanges(2_000, () => now);
    changes.mark("a");
    expect(changes.has("a")).toBe(true);
    now += 2_001;
    expect(changes.has("a")).toBe(false);
    expect(changes.has("b")).toBe(false);
  });
});

describe("markChangedRecordKeys", () => {
  it("marks added, changed and removed keys with the prefix", () => {
    const changes = new RecentKeyChanges(2_000);
    const same = { text: "same" };
    markChangedRecordKeys(
      changes,
      "d:",
      { kept: same, changed: { text: "old" }, removed: { text: "x" } },
      { kept: same, changed: { text: "new" }, added: { text: "y" } },
    );
    expect(["kept", "changed", "removed", "added"].map((key) => changes.has(`d:${key}`))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("diffIncomingRecord", () => {
  it("takes the other window's keys unless they changed here", () => {
    const diff = diffIncomingRecord(
      { same: 1, theirs: 1, mine: 1, gone: 1, mineGone: 1 },
      { same: 1, theirs: 2, mine: 2, added: 3 },
      (key) => key === "mine" || key === "mineGone",
    );
    expect(diff.replace).toEqual([
      ["theirs", 2],
      ["added", 3],
    ]);
    expect(diff.remove).toEqual(["gone"]);
    expect(diff.localAhead).toBe(true);
  });

  it("reports no work when both copies match", () => {
    const diff = diffIncomingRecord({ a: { x: 1 } }, { a: { x: 1 } }, () => true);
    expect(diff).toEqual({ replace: [], remove: [], localAhead: false });
  });
});
