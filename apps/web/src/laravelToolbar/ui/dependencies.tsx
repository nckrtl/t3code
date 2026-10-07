import { Package } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";

import { useToolbarTab } from "../context";
import {
  cellClass,
  EmptyRow,
  headRowClass,
  PanelShell,
  rowClass,
  tableClass,
  UnderlineTabs,
} from "./parts";

import { SortHeader, sortTableRows, useTableSort } from "./tableSort";

type DependencyTab = "composer" | "javascript";

export function DependenciesPanel() {
  const { selected } = useToolbarTab();
  const [tab, setTab] = useState<DependencyTab>("composer");
  const dependencies = selected?.dependencies;
  const sorting = useTableSort();
  const packages = dependencies?.[tab];
  const sortedPackages = sortTableRows(packages ?? [], sorting.sort, (dependency, column) => {
    if (column === "name") return dependency.name;
    if (column === "version") return dependency.version;
    if (column === "constraint") return dependency.constraint;
    return dependency.development ? "Dev" : "Production";
  });
  const manager = tab === "javascript" ? dependencies?.package_manager : null;

  return (
    <PanelShell
      icon={Package}
      title="Dependencies"
      hasTabs
      flush
      meta={
        packages ? (
          <span className="tabular-nums">
            {packages.length} {packages.length === 1 ? "package" : "packages"}
          </span>
        ) : undefined
      }
      actions={
        manager ? <span className="text-muted-foreground text-xs">{manager}</span> : undefined
      }
    >
      <UnderlineTabs
        value={tab}
        tabs={[
          ["composer", "Composer"],
          ["javascript", "JavaScript"],
        ]}
        onChange={setTab}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {packages == null ? (
          <EmptyRow>Dependency data is not available for this request.</EmptyRow>
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
                <tr key={dependency.name} className={rowClass}>
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
    </PanelShell>
  );
}
