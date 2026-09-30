import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  lastWorkspaceThread,
  workspaceAttention,
  workspaceThreads,
} from "./workspaceActivity.logic";

const local = EnvironmentId.make("local");
const beast = EnvironmentId.make("beast");
function thread(environmentId = local, id = "t1") {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId: ProjectId.make("p1"),
    archivedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    interactionMode: "default" as const,
    latestTurn: null,
    session: null,
    backgroundLiveness: null,
  };
}
const ref = (environmentId = local, id = "t1") => scopeThreadRef(environmentId, ThreadId.make(id));
const visited = (environmentId = local, id = "t1", time = "2026-09-30T10:00:00Z") => ({
  [scopedThreadKey(ref(environmentId, id))]: time,
});

describe("workspace thread navigation", () => {
  it("remembers thread identity separately for matching ids on two machines", () => {
    const candidates = [thread(), thread(beast)];
    expect(lastWorkspaceThread(candidates, ref(beast), visited())).toEqual(ref(beast));
    expect(workspaceThreads(candidates, new Set(["local:p1"]))).toEqual([thread()]);
    expect(
      lastWorkspaceThread(
        workspaceThreads(candidates, new Set(["local:p1"])),
        ref(beast),
        visited(),
      ),
    ).toEqual(ref());
  });
  it("falls back to the last visited eligible thread when the saved one was removed", () => {
    const candidates = [thread(), thread(local, "t2")];
    expect(
      lastWorkspaceThread(candidates, ref(local, "gone"), {
        ...visited(),
        ...visited(local, "t2", "2026-09-30T11:00:00Z"),
      }),
    ).toEqual(ref(local, "t2"));
    expect(lastWorkspaceThread(candidates, undefined, {})).toBeNull();
    expect(lastWorkspaceThread([], ref(), visited())).toBeNull();
    expect(workspaceThreads([{ ...thread(), archivedAt: "2026-09-30T12:00:00Z" }], null)).toEqual(
      [],
    );
  });
});

describe("workspace attention", () => {
  const completed = {
    ...thread(),
    latestTurn: {
      turnId: "turn-1" as never,
      state: "completed" as const,
      assistantMessageId: null,
      requestedAt: "2026-09-30T10:00:00Z",
      startedAt: "2026-09-30T10:00:00Z",
      completedAt: "2026-09-30T11:00:00Z",
    },
  };
  it("reports unread completions, approvals and input requests", () => {
    const candidates = [
      completed,
      { ...thread(beast), hasPendingApprovals: true },
      { ...thread(local, "t2"), hasPendingUserInput: true },
    ];
    expect(workspaceAttention(candidates, visited())).toEqual({ unread: 1, approval: 1, input: 1 });
    expect(
      workspaceAttention(workspaceThreads(candidates, new Set(["local:p1"])), visited()),
    ).toEqual({ unread: 1, approval: 0, input: 1 });
  });
  it("clears unread after a visit and follows T3's never-visited semantics", () => {
    expect(workspaceAttention([completed], visited(local, "t1", "2026-09-30T12:00:00Z"))).toEqual({
      unread: 0,
      approval: 0,
      input: 0,
    });
    expect(workspaceAttention([completed], {})).toEqual({ unread: 0, approval: 0, input: 0 });
  });
});
