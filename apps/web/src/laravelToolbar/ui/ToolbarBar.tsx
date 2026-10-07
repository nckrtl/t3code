import { Box, Database, ListIcon, MemoryStick, Package, Timer, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";
import { cn } from "~/lib/utils";

import { useOrbitTool, useToolbarTab } from "../context";
import { formatMs, hasQueryIssues, modelCount, summarize, wallTimeMs } from "../model";
import { LaravelIcon, PhpIcon } from "./brandIcons";
import { DependenciesPanel } from "./dependencies";
import { DatabasePanel, EnvironmentPanel, MemoryPanel, ModelsPanel, TimingsPanel } from "./panels";
import { OrbitIcon, OrbitPanel } from "./orbit";
import { ToolbarPanelResizeContext, useToolbarPanelResize } from "./panelResize";
import { MethodBadge, StatusBadge } from "./parts";
import { RequestPanel, RequestsPanel } from "./requests";

export const PANEL_IDS = [
  "requests",
  "request",
  "timings",
  "memory",
  "database",
  "models",
  "orbit",
  "environment",
  "dependencies",
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

const PANELS: Record<PanelId, () => ReactNode> = {
  requests: () => <RequestsPanel />,
  request: () => <RequestPanel />,
  timings: () => <TimingsPanel />,
  memory: () => <MemoryPanel />,
  database: () => <DatabasePanel />,
  models: () => <ModelsPanel />,
  orbit: () => <OrbitPanel />,
  environment: () => <EnvironmentPanel />,
  dependencies: () => <DependenciesPanel />,
};

const OPEN_DELAY_MS = 75;
const CLOSE_DELAY_MS = 120;

/** Hover opens a panel, click pins it. A pinned panel stays until it is clicked again. */
function usePanels(initialPinned: PanelId | null) {
  const [pinned, setPinned] = useState<PanelId | null>(initialPinned);
  const [hovered, setHovered] = useState<PanelId | null>(null);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return {
    active: hovered ?? pinned,
    pinned,
    enter: (id: PanelId) => {
      clear();
      timer.current = window.setTimeout(() => setHovered(id), OPEN_DELAY_MS);
    },
    stay: clear,
    pin: () => {
      clear();
      setPinned(hovered ?? pinned);
      setHovered(null);
    },
    leave: () => {
      clear();
      timer.current = window.setTimeout(() => setHovered(null), CLOSE_DELAY_MS);
    },
    toggle: (id: PanelId) => {
      clear();
      setHovered(null);
      setPinned((current) => (current === id ? null : id));
    },
  };
}

/** The bar under the browser page, with its flyout panels. */
export function ToolbarBar({ initialPanel = null }: { initialPanel?: PanelId | null }) {
  const panels = usePanels(initialPanel);
  const hostRef = useRef<HTMLDivElement>(null);
  const resize = useToolbarPanelResize(hostRef, panels.pin);
  const { tab, selectedId, selected, viewingHistory, select } = useToolbarTab();
  const orbit = useOrbitTool();
  const orbitProcesses = orbit.state.status === "ready" ? orbit.state.processes : [];
  const row = tab.history.find((entry) => entry.row.id === selectedId);
  const summary = row ? summarize(row.row, selected) : null;

  // Bar items are flat: no border, a light fill on hover, a stronger one while open.
  const item = (id: PanelId, label: string, children: ReactNode, shrink = false) => (
    <button
      type="button"
      aria-label={label}
      data-pressed={panels.active === id ? "" : undefined}
      onMouseEnter={() => panels.enter(id)}
      onMouseLeave={panels.leave}
      onClick={() => panels.toggle(id)}
      className={cn(
        "inline-flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-md pr-2 font-medium text-foreground text-xs outline-none hover:bg-foreground/6 focus-visible:ring-1 focus-visible:ring-ring data-pressed:bg-foreground/10 [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
        id === "request" ? "pl-1" : "pl-2",
        shrink ? "shrink" : "shrink-0",
      )}
    >
      {children}
    </button>
  );

  return (
    <div ref={hostRef} className="relative shrink-0">
      {/* The flyout spans the browser edge to edge and sits directly on the bar, on the
          theme's canvas like the bar (popover is the small-menu surface). */}
      {panels.active ? (
        <div
          className="absolute inset-x-0 bottom-full z-40 border-t bg-background text-foreground shadow-lg"
          style={{ height: resize.height }}
          onMouseEnter={panels.stay}
          onMouseLeave={() => {
            if (panels.pinned === null) panels.leave();
          }}
        >
          <RenderErrorBoundary
            fallback={
              <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                This panel cannot show this request's data.
              </div>
            }
            resetKeys={[panels.active, selected]}
          >
            <ToolbarPanelResizeContext value={resize}>
              {PANELS[panels.active]()}
            </ToolbarPanelResizeContext>
          </RenderErrorBoundary>
        </div>
      ) : null}
      {/* Narrow browsers drop the versions; the route name truncates. */}
      <div className="@container flex h-9 items-center gap-0.5 overflow-hidden border-t border-border/60 bg-background px-2">
        {item(
          "requests",
          "Requests on this page",
          <>
            <ListIcon />
            <span className="tabular-nums">{tab.history.length}</span>
          </>,
        )}
        {summary
          ? item(
              "request",
              "Request details",
              <>
                <StatusBadge status={summary.status} />
                <MethodBadge method={summary.method} />
                <span className="truncate text-muted-foreground">
                  {summary.routeName ?? "Unnamed route"}
                </span>
              </>,
              true,
            )
          : null}
        {/* Shown while an older request is selected; returns to the page's own request. */}
        {viewingHistory && row ? (
          <button
            type="button"
            onClick={() => select(null)}
            className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-info/15 px-2 font-medium text-info-foreground text-xs outline-none hover:bg-info/20 focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4 sm:[&_svg]:size-3.5"
          >
            {new Date(row.receivedAt).toLocaleTimeString([], { hour12: false })}
            <X />
          </button>
        ) : null}
        {selected ? (
          <>
            {item(
              "timings",
              "Timings",
              <>
                <Timer />
                <span className="tabular-nums">{formatMs(wallTimeMs(selected))}</span>
              </>,
            )}
            {item(
              "memory",
              "Memory",
              <>
                <MemoryStick />
                <span className="tabular-nums">
                  {selected.profiler?.total_allocated_memory?.formattedValue ?? "–"}
                </span>
              </>,
            )}
            {item(
              "database",
              "Database queries",
              <>
                <span className="relative">
                  <Database />
                  {/* Amber on the icon when this request ran duplicate or slow queries. */}
                  {hasQueryIssues(selected) ? (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-warning" />
                  ) : null}
                </span>
                <span className="tabular-nums">{selected.queries?.queries?.length ?? 0}</span>
              </>,
            )}
            {item(
              "models",
              "Eloquent models",
              <>
                <Box />
                <span className="tabular-nums">{modelCount(selected)}</span>
              </>,
            )}
          </>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {orbit.state.status === "ready"
            ? item(
                "orbit",
                "Orbit processes",
                <>
                  <span className="relative">
                    <OrbitIcon />
                    {/* Red on the icon when a process that should run is down. */}
                    {orbitProcesses.some((process) => process.status === "crashed") ? (
                      <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive" />
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    {orbitProcesses.filter((process) => process.status === "running").length}/
                    {orbitProcesses.length}
                  </span>
                </>,
              )
            : null}
          {selected ? (
            <div className="hidden items-center @2xl:flex">
              {item("dependencies", "Dependencies", <Package />)}
              {item(
                "environment",
                "Laravel and PHP",
                <>
                  <LaravelIcon />
                  <span className="text-muted-foreground">
                    {selected.laravel?.version?.split(".").slice(0, 2).join(".") ?? "–"}
                  </span>
                  <span className="text-muted-foreground" aria-hidden="true">
                    ·
                  </span>
                  <PhpIcon />
                  <span className="text-muted-foreground">
                    {selected.php?.version?.split(".").slice(0, 2).join(".") ?? "–"}
                  </span>
                </>,
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
