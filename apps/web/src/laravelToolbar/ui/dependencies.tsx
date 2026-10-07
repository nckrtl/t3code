import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

import { useOrbitTool } from "../context";
import type { OrbitDependencies } from "../orbit";
import { cellClass, EmptyRow, headRowClass, rowClass, tableClass } from "./parts";

import { SortHeader, sortTableRows, useTableSort } from "./tableSort";

type DependencyTab = "composer" | "javascript";

export function DependenciesPanel() {
  const { state, source } = useOrbitTool();
  const [tab, setTab] = useState<DependencyTab>("composer");
  const instanceId = state.status === "ready" ? state.page.instanceId : null;
  const [loaded, setLoaded] = useState<{
    source: typeof source;
    instanceId: number;
    data?: OrbitDependencies;
    error?: string;
  }>();
  useEffect(() => {
    if (!source || instanceId === null) return;
    let cancelled = false;
    void source.dependencies(instanceId).then(
      (data) => {
        if (!cancelled) setLoaded({ source, instanceId, data });
      },
      (error: unknown) => {
        if (!cancelled)
          setLoaded({
            source,
            instanceId,
            error: error instanceof Error ? error.message : "Could not load dependencies.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, instanceId]);
  const result =
    loaded?.source === source && loaded?.instanceId === instanceId ? loaded : undefined;
  const dependencies = result?.data;
  const sorting = useTableSort();
  const packages = dependencies?.[tab];
  const sortedPackages = sortTableRows(packages ?? [], sorting.sort, (dependency, column) => {
    if (column === "name") return dependency.name;
    if (column === "version") return dependency.version;
    if (column === "constraint") return dependency.constraint;
    return dependency.development ? "Dev" : "Production";
  });

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Dependency ecosystems" className="w-44 shrink-0 border-r">
        {(["composer", "javascript"] as const).map((ecosystem) => (
          <button
            key={ecosystem}
            type="button"
            aria-pressed={tab === ecosystem}
            onClick={() => setTab(ecosystem)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 border-b px-3 py-3 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
              tab === ecosystem
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <span>
              <span className="block">{ecosystem === "composer" ? "Composer" : "JavaScript"}</span>
              {ecosystem === "javascript" && dependencies?.package_manager ? (
                <span className="mt-1 block text-2xs leading-4 text-muted-foreground">
                  {dependencies.package_manager}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {dependencies?.[ecosystem]?.length ?? "–"}
            </span>
          </button>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {packages == null ? (
          <EmptyRow>
            {result?.error ??
              dependencies?.errors?.[tab] ??
              (dependencies
                ? "No saved inventory. Run an Orbit dependency scan for this instance."
                : "Loading dependencies…")}
          </EmptyRow>
        ) : packages.length === 0 ? (
          <EmptyRow>No {tab === "composer" ? "Composer" : "JavaScript"} dependencies</EmptyRow>
        ) : (
          <table className={cn(tableClass, "min-w-lg")}>
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className={headRowClass}>
                <SortHeader column="name" label="Package" {...sorting} />
                <SortHeader column="version" label="Version" {...sorting} />
                <SortHeader column="constraint" label="Requirement" {...sorting} />
                <SortHeader column="type" label="Type" {...sorting} />
              </tr>
            </thead>
            <tbody>
              {sortedPackages.map((dependency) => (
                <tr
                  key={dependency.id ?? `${dependency.name}:${dependency.version}`}
                  className={rowClass}
                >
                  <td className={cellClass}>
                    <span className="block truncate font-mono">{dependency.name}</span>
                  </td>
                  <td className={cellClass}>
                    <span className="font-mono tabular-nums">{dependency.version ?? "–"}</span>
                  </td>
                  <td className={cellClass}>
                    <span className="font-mono text-muted-foreground">
                      {dependency.constraint ?? "–"}
                    </span>
                  </td>
                  <td className={cellClass}>
                    <span className="text-muted-foreground">
                      {dependency.development ? "Dev" : "Production"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
