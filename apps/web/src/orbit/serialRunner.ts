import type { ProfileSyncRunOptions } from "@t3tools/client-runtime/orbit-gateway";

/**
 * Runs the profile sync one run at a time. A trigger that arrives while a run is in flight does
 * not start a second one (two runs would both PATCH the same section versions and the second
 * would get a 409); it queues a single follow-up that starts when the run ends, so a change made
 * during the run still goes out. Triggers that pile up share that one follow-up, and a forced
 * push or pull among them is kept for it.
 */
export function createSerialRunner(
  task: (options: ProfileSyncRunOptions | undefined) => Promise<void>,
): (options?: ProfileSyncRunOptions) => void {
  let running = false;
  let queued = false;
  let queuedOptions: ProfileSyncRunOptions | undefined;

  const trigger = (options?: ProfileSyncRunOptions): void => {
    if (running) {
      queued = true;
      if (options?.force) queuedOptions = options;
      return;
    }
    running = true;
    void task(options)
      .catch(() => {
        // The task reports its own failures; the queue must survive them.
      })
      .finally(() => {
        running = false;
        if (!queued) return;
        queued = false;
        const next = queuedOptions;
        queuedOptions = undefined;
        trigger(next);
      });
  };
  return trigger;
}
