import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  lastWorkspaceThread,
  workspaceAttention,
  workspaceThreads,
} from "./workspaceActivity.logic";
import type { ThreadSession } from "./types";

const local = EnvironmentId.make("local");
const beast = EnvironmentId.make("beast");
function thread(environmentId = local, id = "t1") {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId: ProjectId.make("p1"),
    archivedAt: null,
    settledOverride: null,
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
  const session = (status: ThreadSession["status"]): ThreadSession => ({
    threadId: ThreadId.make("t1"),
    status,
    providerName: "Codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    activeTurnId: null,
    lastError: null,
    updatedAt: "2026-09-30T11:00:00Z",
  });
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
  it("waits for the turn and session to finish before reporting done", () => {
    const running = {
      ...completed,
      latestTurn: { ...completed.latestTurn, state: "running" as const },
    };
    expect(workspaceAttention([running], visited()).unread).toBe(0);
    for (const status of ["running", "starting"] as const) {
      expect(
        workspaceAttention([{ ...completed, session: session(status) }], visited()).unread,
      ).toBe(0);
    }
    expect(
      workspaceAttention([{ ...completed, session: session("ready") }], visited()).unread,
    ).toBe(1);
    for (const state of ["error", "interrupted"] as const) {
      expect(
        workspaceAttention(
          [{ ...completed, latestTurn: { ...completed.latestTurn, state } }],
          visited(),
        ).unread,
      ).toBe(0);
    }
  });
  it("suppresses done while background work continues", () => {
    for (const backgroundLiveness of ["working", "monitoring"] as const) {
      expect(workspaceAttention([{ ...completed, backgroundLiveness }], visited()).unread).toBe(0);
    }
  });
  it("reports requests separately from unread completions", () => {
    expect(workspaceAttention([{ ...completed, hasPendingApprovals: true }], visited())).toEqual({
      unread: 0,
      approval: 1,
      input: 0,
    });
    expect(workspaceAttention([{ ...completed, hasPendingUserInput: true }], visited())).toEqual({
      unread: 0,
      approval: 0,
      input: 1,
    });
  });
  it("clears the workspace dot when the only active thread is read, even with unread settled history", () => {
    const history = { ...completed, id: ThreadId.make("old"), settledOverride: "settled" as const };
    const candidates = [completed, history];
    const visits = { ...visited(local, "t1", "2026-09-30T11:00:00Z"), ...visited(local, "old") };
    expect(workspaceAttention(candidates, visits).unread).toBe(0);
    expect(
      workspaceAttention([{ ...history, settledOverride: "active" as const }], visits).unread,
    ).toBe(1);
  });
  it("stops counting a project's unread completions when it is removed from the workspace", () => {
    const former = { ...completed, id: ThreadId.make("old"), projectId: ProjectId.make("former") };
    const candidates = [completed, former];
    const visits = { ...visited(local, "t1", "2026-09-30T11:00:00Z"), ...visited(local, "old") };
    expect(
      workspaceAttention(
        workspaceThreads(candidates, new Set(["local:p1", "local:former"])),
        visits,
      ).unread,
    ).toBe(1);
    expect(
      workspaceAttention(workspaceThreads(candidates, new Set(["local:p1"])), visits).unread,
    ).toBe(0);
  });
});
