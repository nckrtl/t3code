import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import { createTerminalOrbitTransport } from "~/orbit/orbitTransport";
import { useProject, useThreadShell } from "~/state/entities";
import { serverEnvironment } from "~/state/server";

import { browserToolbarSource } from "./bridge";
import { ToolbarProvider } from "./context";
import { gatewayOrbitSource, type OrbitSource } from "./orbit";
import { useLaravelToolbarStore } from "./store";
import { ToolbarBar } from "./ui/ToolbarBar";

// One source per machine, project and domain, so remounting the bar does not ask Orbit again.
const orbitSources = new Map<string, OrbitSource>();

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** Orbit calls run on the thread's machine, from its project folder (see ~/orbit/orbitTransport.ts). */
function useOrbitSource(threadRef: ScopedThreadRef, pageUrl: string): OrbitSource | null {
  const serverThread = useThreadShell(threadRef);
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const thread = serverThread ?? draftThread;
  const project = useProject(
    thread ? scopeProjectRef(thread.environmentId, thread.projectId) : null,
  );
  const domain = hostname(pageUrl);
  const environmentId = project?.environmentId ?? null;
  const cwd = project?.workspaceRoot ?? null;
  return useMemo(() => {
    if (!environmentId || !cwd || !domain) return null;
    const key = `${environmentId}\u0000${cwd}\u0000${domain}`;
    let source = orbitSources.get(key);
    if (!source) {
      source = gatewayOrbitSource(createTerminalOrbitTransport({ environmentId, cwd }), domain);
      orbitSources.set(key, source);
    }
    return source;
  }, [cwd, domain, environmentId]);
}

/**
 * The Laravel Toolbar under a browser tab's page. Renders nothing until the page sends
 * toolbar data, so non-Laravel pages keep the full height.
 */
export function BrowserLaravelToolbar({
  tabId,
  threadRef,
  pageUrl,
}: {
  tabId: string;
  threadRef: ScopedThreadRef;
  pageUrl: string;
}) {
  const tab = useLaravelToolbarStore((state) => state.byTabId[tabId]);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(threadRef.environmentId));
  const openInPreferredEditor = useOpenInPreferredEditor(
    threadRef.environmentId,
    serverConfig?.availableEditors ?? [],
  );
  const orbit = useOrbitSource(threadRef, pageUrl);
  // Source paths come from the server that runs the page; they open when this thread's
  // environment is that machine.
  const source = useMemo(
    () => ({
      ...browserToolbarSource(tabId, (target) => void openInPreferredEditor(target)),
      orbit,
    }),
    [openInPreferredEditor, orbit, tabId],
  );
  if (!tab?.currentId) return null;
  // The payload comes from the page. Data the bar cannot show hides the bar until new data
  // arrives; it never takes the app down.
  return (
    <RenderErrorBoundary fallback={null} resetKeys={[tab]}>
      <ToolbarProvider tabId={tabId} source={source}>
        <ToolbarBar />
      </ToolbarProvider>
    </RenderErrorBoundary>
  );
}
