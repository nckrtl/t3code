import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";

import { headCellClass } from "./parts";

export type TableSort = { column: string; direction: "ascending" | "descending" } | null;
type SortValue = string | number | null | undefined;

export function nextTableSort(sort: TableSort, column: string): TableSort {
  if (sort?.column !== column) return { column, direction: "ascending" };
  return sort.direction === "ascending" ? { column, direction: "descending" } : null;
}

export function sortTableRows<T>(
  rows: readonly T[],
  sort: TableSort,
  value: (row: T, column: string) => SortValue,
): readonly T[] {
  if (!sort) return rows;
  return rows.toSorted((left, right) => {
    const a = value(left, sort.column);
    const b = value(right, sort.column);
    // Missing values stay at the bottom in either direction. Equal values retain source order.
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    const compared =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "ascending" ? compared : -compared;
  });
}

/** History can contain formatted durations even before the full request payload loads. */
export function durationSortValue(duration: string | null): number | null {
  if (!duration) return null;
  const match = /^\s*([\d.]+)\s*(ns|μs|µs|us|ms|s|sec|min|m)?\s*$/i.exec(duration);
  if (!match) return null;
  const factors: Record<string, number> = {
    ns: 0.000001,
    μs: 0.001,
    µs: 0.001,
    us: 0.001,
    ms: 1,
    s: 1000,
    sec: 1000,
    min: 60000,
    m: 60000,
  };
  const value = Number(match[1]);
  return Number.isFinite(value) ? value * (factors[match[2]?.toLowerCase() ?? "ms"] ?? 1) : null;
}

export function useTableSort() {
  const [sort, setSort] = useState<TableSort>(null);
  return { sort, onSort: (column: string) => setSort((current) => nextTableSort(current, column)) };
}

export function SortHeader({
  column,
  label,
  sort,
  onSort,
  className,
  align = "left",
}: {
  column: string;
  label: string;
  sort: TableSort;
  onSort: (column: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const direction = sort?.column === column ? sort.direction : "none";
  const next =
    direction === "none"
      ? "ascending"
      : direction === "ascending"
        ? "descending"
        : "original order";
  return (
    <th scope="col" aria-sort={direction} className={cn(headCellClass, className)}>
      <button
        type="button"
        aria-label={`${label}: sort ${next}`}
        onClick={() => onSort(column)}
        className={cn(
          "flex h-9 w-full cursor-pointer items-center gap-1 text-left outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
          align === "right" && "justify-end text-right",
        )}
      >
        <span className="truncate">{label}</span>
        {direction === "ascending" ? <ArrowUp className="size-3 shrink-0" /> : null}
        {direction === "descending" ? <ArrowDown className="size-3 shrink-0" /> : null}
      </button>
    </th>
  );
}
