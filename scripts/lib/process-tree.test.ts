import { assert, describe, it } from "vite-plus/test";

import {
  findDescendantPids,
  parseProcessList,
  planDescendantsToStop,
  stopDescendantsWith,
  type ProcessTreeHost,
} from "./process-tree.ts";

const ps = [
  "    1     0 /sbin/launchd",
  "   50     1 login-shell",
  "   60    50 vp run dev:desktop",
  "  100    60 node scripts/dev-runner.ts dev:desktop",
  "  101   100 vp run --filter=@t3tools/desktop dev",
  "  102   101 /bin/sh -c vp pack --watch",
  "  103   102 node dev-electron.mjs",
  "  104   103 /Applications/Conn (Dev).app/Contents/MacOS/Electron --t3code-dev-root=/x",
  "  200     1 node unrelated.js",
  "  201   200 node child-of-unrelated.js",
].join("\n");

// The runner (pid 100) is "this process" in these tests; its parent is `vp run` (60).
const self = { pid: 100, parentPid: 60 };

/** A fake machine: signals are recorded, never sent. */
function makeFakeHost(
  entries: ReturnType<typeof parseProcessList>,
  options: { readonly ignoresSigterm?: ReadonlySet<number> } = {},
) {
  const signals: Array<[number, string]> = [];
  const dead = new Set<number>();
  let clock = 0;
  const host: ProcessTreeHost = {
    selfPid: self.pid,
    parentPid: self.parentPid,
    readProcessList: () => entries.filter((entry) => !dead.has(entry.pid)),
    signal: (pid, signal) => {
      signals.push([pid, signal]);
      if (signal === "SIGKILL" || !options.ignoresSigterm?.has(pid)) dead.add(pid);
    },
    isAlive: (pid) => !dead.has(pid),
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { host, signals };
}

describe("process tree", () => {
  it("parses ps output with spaces in commands", () => {
    const entries = parseProcessList(ps);
    assert.equal(entries.length, 10);
    assert.deepStrictEqual(entries[7], {
      pid: 104,
      ppid: 103,
      command: "/Applications/Conn (Dev).app/Contents/MacOS/Electron --t3code-dev-root=/x",
    });
  });

  it("finds only the processes below the root, nearest first", () => {
    assert.deepStrictEqual(findDescendantPids(parseProcessList(ps), 101), [102, 103, 104]);
    assert.deepStrictEqual(findDescendantPids(parseProcessList(ps), 104), []);
  });

  it("plans the subtree of a real child process", () => {
    assert.deepStrictEqual(planDescendantsToStop(parseProcessList(ps), 101, self), [102, 103, 104]);
  });

  it("plans nothing for a missing, invalid, or init root", () => {
    const entries = parseProcessList(ps);
    for (const root of [undefined, 0, 1, -5, 1.5, Number.NaN]) {
      assert.deepStrictEqual(planDescendantsToStop(entries, root, self), []);
    }
  });

  it("plans nothing for this process or any of its ancestors", () => {
    const entries = parseProcessList(ps);
    // 1 launchd, 50 login shell, 60 vp run (parent), 100 self: killing their descendants
    // would include this process.
    for (const root of [1, 50, 60, 100]) {
      assert.deepStrictEqual(planDescendantsToStop(entries, root, self), []);
    }
  });

  it("still protects the parent when ps did not list it", () => {
    const entries = parseProcessList(ps).filter((entry) => entry.pid !== 60);
    assert.deepStrictEqual(planDescendantsToStop(entries, 60, self), []);
  });

  it("plans nothing when the process list puts this process below the root", () => {
    const entries = [
      { pid: 300, ppid: 1, command: "root" },
      { pid: 100, ppid: 300, command: "self under root" },
      { pid: 301, ppid: 300, command: "sibling" },
    ];
    assert.deepStrictEqual(planDescendantsToStop(entries, 300, self), []);
  });
});

describe("stopDescendantsWith", () => {
  it("terminates the subtree and leaves everything else alone", async () => {
    const { host, signals } = makeFakeHost(parseProcessList(ps));
    await stopDescendantsWith(host, 101, 5_000);
    assert.deepStrictEqual(signals, [
      [102, "SIGTERM"],
      [103, "SIGTERM"],
      [104, "SIGTERM"],
    ]);
  });

  it("kills what ignores SIGTERM after the grace period", async () => {
    const { host, signals } = makeFakeHost(parseProcessList(ps), {
      ignoresSigterm: new Set([104]),
    });
    await stopDescendantsWith(host, 101, 1_000);
    assert.deepStrictEqual(signals.slice(-1), [[104, "SIGKILL"]]);
    assert.equal(signals.filter(([, signal]) => signal === "SIGKILL").length, 1);
  });

  it("signals nothing without a usable root", async () => {
    for (const root of [undefined, 0, 1]) {
      const { host, signals } = makeFakeHost(parseProcessList(ps));
      await stopDescendantsWith(host, root, 1_000);
      assert.deepStrictEqual(signals, []);
    }
  });

  it("signals nothing when the root is an ancestor of this process", async () => {
    for (const root of [1, 50, 60, 100]) {
      const { host, signals } = makeFakeHost(parseProcessList(ps));
      await stopDescendantsWith(host, root, 1_000);
      assert.deepStrictEqual(signals, []);
    }
  });
});
