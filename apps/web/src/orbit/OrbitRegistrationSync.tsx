import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import { useEffect, useMemo } from "react";

import { toastManager } from "../components/ui/toast";
import { useThreadShell } from "../state/entities";
import { OrbitApiError } from "./orbitApi";
import { describeOrbitError, registerOrbitThreadWorktree } from "./orbitInstances";
import { type OrbitThreadInstance, useOrbitThreadStore } from "./orbitThreadStore";
import { createTerminalOrbitTransport } from "./orbitTransport";

/** How long to wait for T3's readable branch name before registering anyway. */
const BRANCH_NAME_WAIT_MS = 60_000;
const RETRY_AFTER_MS = 30_000;
const inFlight = new Set<string>();

/**
 * Registers each Orbit thread's worktree as an Orbit Instance once T3's server
 * has given its branch a readable name (or after a minute), so Orbit records
 * that branch and routes the Instance under it. Mounted once, in the main window.
 */
export function OrbitRegistrationSync() {
  const byThreadKey = useOrbitThreadStore((state) => state.byThreadKey);
  return (
    <>
      {Object.entries(byThreadKey).map(([key, instance]) =>
        instance.phase === "registering" ? (
          <OrbitThreadRegistration key={key} threadKey={key} instance={instance} />
        ) : null,
      )}
    </>
  );
}

function OrbitThreadRegistration(props: {
  readonly threadKey: string;
  readonly instance: OrbitThreadInstance;
}) {
  const { instance, threadKey } = props;
  const ref = useMemo(
    () => scopeThreadRef(instance.environmentId as EnvironmentId, instance.threadId as ThreadId),
    [instance.environmentId, instance.threadId],
  );
  const shell = useThreadShell(ref);
  const branch = shell?.branch ?? null;
  const worktreePath = shell?.worktreePath ?? null;
  const title = shell?.title ?? null;

  useEffect(() => {
    // The thread must exist and still work in this worktree.
    if (!branch || worktreePath !== instance.checkoutPath || inFlight.has(threadKey)) return;
    const waitedMs = Date.now() - Date.parse(instance.createdAt);
    if (isTemporaryWorktreeBranch(branch) && waitedMs < BRANCH_NAME_WAIT_MS) {
      // Touching the entry re-runs this effect once the wait is over.
      const timer = globalThis.setTimeout(
        () => useOrbitThreadStore.getState().update(ref, { retryAt: Date.now() }),
        BRANCH_NAME_WAIT_MS - waitedMs,
      );
      return () => globalThis.clearTimeout(timer);
    }

    inFlight.add(threadKey);
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const transport = createTerminalOrbitTransport({
      environmentId: ref.environmentId,
      cwd: instance.controlCwd,
    });
    void registerOrbitThreadWorktree(transport, {
      worktreePath: instance.checkoutPath,
      instanceName: instance.instanceName,
      branch,
      title,
      projectId: instance.projectId,
      projectSlug: instance.projectSlug,
      tld: instance.tld,
    })
      .then((registered) => {
        useOrbitThreadStore.getState().update(ref, {
          phase: "registered",
          instanceId: registered.id,
          url: registered.url,
          failure: null,
        });
      })
      .catch((error: unknown) => {
        // An unreachable machine or a restarting Gateway: an identical
        // registration request resumes, so try again later.
        if (!(error instanceof OrbitApiError) || error.status >= 500) {
          retryTimer = globalThis.setTimeout(
            () => useOrbitThreadStore.getState().update(ref, { retryAt: Date.now() }),
            RETRY_AFTER_MS,
          );
          return;
        }
        const failure = describeOrbitError(error);
        useOrbitThreadStore.getState().update(ref, { phase: "failed", failure });
        toastManager.add({
          type: "error",
          title: "Orbit could not register the worktree",
          description: `${instance.instanceName}: ${failure}`,
        });
      })
      .finally(() => {
        inFlight.delete(threadKey);
      });
    return () => {
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
    };
  }, [branch, instance, ref, threadKey, title, worktreePath]);

  return null;
}
