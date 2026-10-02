import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import { serverEnvironment } from "~/state/server";

import { browserToolbarSource } from "./bridge";
import { ToolbarProvider } from "./context";
import { useLaravelToolbarStore } from "./store";
import { ToolbarBar } from "./ui/ToolbarBar";

/**
 * The Laravel Toolbar under a browser tab's page. Renders nothing until the page sends
 * toolbar data, so non-Laravel pages keep the full height.
 */
export function BrowserLaravelToolbar({
  tabId,
  environmentId,
}: {
  tabId: string;
  environmentId: EnvironmentId;
}) {
  const tab = useLaravelToolbarStore((state) => state.byTabId[tabId]);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInPreferredEditor = useOpenInPreferredEditor(
    environmentId,
    serverConfig?.availableEditors ?? [],
  );
  // Source paths come from the server that runs the page; they open when this thread's
  // environment is that machine.
  const source = useMemo(
    () => browserToolbarSource(tabId, (target) => void openInPreferredEditor(target)),
    [openInPreferredEditor, tabId],
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
