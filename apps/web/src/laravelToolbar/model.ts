// Pure mapping from the toolbar payload to what the bar and panels show.
import type { ToolbarData, ToolbarHistoryRow, ToolbarQuery } from "./types";

export type RequestKind = "page" | "inertia" | "xhr";

export interface RequestSummary {
  readonly id: string;
  readonly status: number | null;
  readonly method: string;
  readonly uri: string;
  readonly routeName: string | null;
  readonly action: string | null;
  readonly component: string | null;
  readonly kind: RequestKind;
  readonly duration: string | null;
  readonly size: string | null;
}

export interface Stage {
  readonly label: string;
  readonly color: string;
  readonly durationMs: number;
  readonly startMs: number;
  readonly memoryBytes: number;
}

export interface Query {
  readonly sql: string;
  readonly durationMs: number;
  readonly isDuplicate: boolean;
  readonly isSlow: boolean;
  /** Start and length as shares (0–1) of the request's wall time. */
  readonly offset: number;
  readonly share: number;
  readonly file: string | null;
  readonly line: number | null;
}

const FALLBACK_STAGE_COLOR = "#8D76FF";

export function requestKind(row: Pick<ToolbarHistoryRow, "is_xhr" | "response_type">): RequestKind {
  if (!row.is_xhr) return "page";
  return row.response_type === "Inertia" ? "inertia" : "xhr";
}

/** A request as a history row shows it, completed by its full payload when loaded. */
export function summarize(row: ToolbarHistoryRow, data?: ToolbarData | null): RequestSummary {
  return {
    id: row.id,
    status: data?.response?.status_code ?? row.status_code ?? null,
    method: data?.request?.method ?? row.method,
    uri: data?.request?.uri ?? row.uri,
    routeName: data?.request?.route_name ?? row.name ?? null,
    action: data?.request?.controller_action ?? row.action ?? null,
    component: data?.request?.view_name ?? null,
    kind: requestKind(row),
    duration: data?.profiler?.total_wall_time?.formattedValue ?? row.duration ?? null,
    size: responseSize(data) ?? row.size ?? null,
  };
}

/** Newer package versions send the response size as a measurement, older ones as text. */
function responseSize(data?: ToolbarData | null): string | null {
  const size = data?.response?.size;
  if (size == null) return null;
  return typeof size === "string" ? size : (size.formattedValue ?? null);
}

/** The history row for a full payload, when the page sent none (an initial page load). */
export function rowFromData(data: ToolbarData): ToolbarHistoryRow | null {
  if (data.history_row) return data.history_row;
  if (!data.request_id) return null;
  return {
    id: data.request_id,
    is_xhr: false,
    method: data.request?.method ?? "GET",
    uri: data.request?.uri ?? "/",
    name: data.request?.route_name ?? null,
    action: data.request?.controller_action ?? null,
    status_code: data.response?.status_code ?? null,
    size: responseSize(data),
    duration: data.profiler?.total_wall_time?.formattedValue ?? null,
    response_type: data.request?.is_inertia ? "Inertia" : null,
  };
}

/** Request stages laid end to end, so each starts where the previous one ended. */
export function stages(data: ToolbarData): Stage[] {
  let cursor = 0;
  return (data.profiler?.stages ?? []).map((stage) => {
    const durationMs = stage.wall_time?.measurement?.value ?? 0;
    const result: Stage = {
      label: stage.label,
      color: stage.color ?? FALLBACK_STAGE_COLOR,
      durationMs,
      startMs: cursor,
      memoryBytes: stage.memory_real_delta?.measurement?.value ?? 0,
    };
    cursor += durationMs;
    return result;
  });
}

export function wallTimeMs(data: ToolbarData): number {
  return (
    data.profiler?.total_wall_time?.value ??
    stages(data).reduce((total, stage) => total + stage.durationMs, 0)
  );
}

function toQuery(query: ToolbarQuery): Query {
  return {
    sql: query.sql,
    durationMs: query.duration,
    isDuplicate: query.is_duplicate ?? false,
    isSlow: query.is_slow ?? false,
    offset: query.offset ?? 0,
    share: query.percentage ?? 0,
    file: query.file ?? null,
    line: query.line ?? null,
  };
}

export function queries(data: ToolbarData): Query[] {
  return (data.queries?.queries ?? []).map(toQuery);
}

export function hasQueryIssues(data: ToolbarData): boolean {
  return (data.queries?.queries ?? []).some((query) => query.is_duplicate || query.is_slow);
}

export function modelCount(data: ToolbarData): number {
  return (data.models ?? []).reduce((total, model) => total + (model.retrieved ?? 0), 0);
}

export function formatMs(value: number): string {
  return value >= 100 ? `${Math.round(value)}ms` : `${value.toFixed(value >= 10 ? 1 : 2)}ms`;
}

export function formatBytes(value: number): string {
  const size = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (size >= 1024 * 1024) return `${sign}${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size >= 1024) return `${sign}${(size / 1024).toFixed(2)} KB`;
  return `${sign}${size} B`;
}

/** The file name and line of a source path, for a compact link label. */
export function shortLocation(file: string | null, line: number | null): string | null {
  if (!file) return null;
  const name = file.split("/").pop() ?? file;
  return line ? `${name}:${line}` : name;
}

/** Header maps arrive as arrays per name; show them joined. */
export function headerRows(
  headers: Readonly<Record<string, readonly string[]>> | undefined,
): Array<[string, string]> {
  return Object.entries(headers ?? {}).map(([name, values]) => [name, values.join(", ")]);
}
