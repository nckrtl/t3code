// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off - Plain Node helper for dev scripts that run outside an Effect runtime.
import * as NodeChildProcess from "node:child_process";

export interface ProcessEntry {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
}

/** Parses `ps -axo pid=,ppid=,command=` output. */
export function parseProcessList(output: string): ReadonlyArray<ProcessEntry> {
  const entries: Array<ProcessEntry> = [];
  for (const line of output.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (match) entries.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! });
  }
  return entries;
}

/** Every process below `rootPid`, nearest first. The root itself is not included. */
export function findDescendantPids(
  entries: ReadonlyArray<ProcessEntry>,
  rootPid: number,
): ReadonlyArray<number> {
  const found: Array<number> = [];
  const seen = new Set<number>([rootPid]);
  let frontier = [rootPid];
  while (frontier.length > 0) {
    const next: Array<number> = [];
    for (const entry of entries) {
      if (frontier.includes(entry.ppid) && !seen.has(entry.pid)) {
        seen.add(entry.pid);
        found.push(entry.pid);
        next.push(entry.pid);
      }
    }
    frontier = next;
  }
  return found;
}

/** `pid` and every ancestor of it, following parent links. `parentPid` seeds the chain when `ps` missed it. */
export function protectedPids(
  entries: ReadonlyArray<ProcessEntry>,
  pid: number,
  parentPid: number,
): ReadonlySet<number> {
  const parentOf = new Map(entries.map((entry) => [entry.pid, entry.ppid]));
  const protectedSet = new Set<number>([pid, parentPid]);
  const walked = new Set<number>();
  let current = parentOf.get(pid) ?? parentPid;
  while (current > 0 && !walked.has(current)) {
    walked.add(current);
    protectedSet.add(current);
    current = parentOf.get(current) ?? 0;
  }
  return protectedSet;
}

/**
 * The pids to stop for a tree rooted at `rootPid`. Nothing is returned for a root that is not
 * a real child process (missing, 0, 1), or that is this process or one of its ancestors, whose
 * descendants include this process. Protected pids are also removed from the result.
 */
export function planDescendantsToStop(
  entries: ReadonlyArray<ProcessEntry>,
  rootPid: number | undefined,
  self: { readonly pid: number; readonly parentPid: number },
): ReadonlyArray<number> {
  if (rootPid === undefined || !Number.isInteger(rootPid) || rootPid <= 1) return [];
  const protectedSet = protectedPids(entries, self.pid, self.parentPid);
  if (protectedSet.has(rootPid)) return [];
  return findDescendantPids(entries, rootPid).filter((pid) => pid > 1 && !protectedSet.has(pid));
}

export interface ProcessTreeHost {
  readonly selfPid: number;
  readonly parentPid: number;
  readonly readProcessList: () => ReadonlyArray<ProcessEntry>;
  readonly signal: (pid: number, signal: NodeJS.Signals) => void;
  readonly isAlive: (pid: number) => boolean;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

/**
 * Stops everything below `rootPid`: SIGTERM, then SIGKILL for whatever is still alive after
 * `graceMs`. Only pids found by walking parent links from `rootPid` are signalled, never
 * anything matched by name. Descendants that appear during the grace period are killed too.
 */
export async function stopDescendantsWith(
  host: ProcessTreeHost,
  rootPid: number | undefined,
  graceMs: number,
): Promise<void> {
  const self = { pid: host.selfPid, parentPid: host.parentPid };
  const pids = planDescendantsToStop(host.readProcessList(), rootPid, self);
  if (pids.length === 0) return;

  const signalAll = (targets: ReadonlyArray<number>, signal: NodeJS.Signals) => {
    for (const pid of targets) {
      try {
        host.signal(pid, signal);
      } catch {
        // Already gone.
      }
    }
  };

  signalAll(pids, "SIGTERM");
  const deadline = host.now() + graceMs;
  while (host.now() < deadline && pids.some(host.isAlive)) {
    await host.sleep(100);
  }
  const late = planDescendantsToStop(host.readProcessList(), rootPid, self);
  const survivors = new Set([...pids.filter(host.isAlive), ...late]);
  signalAll([...survivors], "SIGKILL");
}

/** The machine's processes, or none where `ps` is unavailable (Windows). */
function readProcessList(): ReadonlyArray<ProcessEntry> {
  const result = NodeChildProcess.spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.status === 0 ? parseProcessList(result.stdout) : [];
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** `stopDescendantsWith` for this machine. Tests call `stopDescendantsWith` with a fake host. */
export function stopDescendants(rootPid: number | undefined, graceMs: number): Promise<void> {
  return stopDescendantsWith(
    {
      selfPid: process.pid,
      parentPid: process.ppid,
      readProcessList,
      signal: (pid, signal) => process.kill(pid, signal),
      isAlive,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Date.now,
    },
    rootPid,
    graceMs,
  );
}
