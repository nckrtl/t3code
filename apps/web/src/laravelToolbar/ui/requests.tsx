import {
  Box,
  ChevronRight,
  CornerDownRight,
  Globe,
  Layers,
  ListIcon,
  Search,
  Timer,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

import { useToolbarTab } from "../context";
import { headerRows, type PropRow, propRows, shortLocation, summarize } from "../model";
import {
  cellClass,
  EmptyRow,
  headCellClass,
  headRowClass,
  KeyValueRows,
  MethodBadge,
  PanelShell,
  rowClass,
  Section,
  SourceLink,
  Stat,
  StatStrip,
  StatusBadge,
  tableClass,
  UnderlineTabs,
} from "./parts";

const KIND_LABEL = { page: "page", inertia: "inertia", xhr: "xhr" } as const;

function clockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false });
}

// ─── Requests: every request this page made ─────────────────────────────────

// Columns that only show when the browser is wide enough; the URI takes the rest.
const WIDE = {
  type: { col: "hidden @2xl:table-column", cell: "hidden @2xl:table-cell" },
  component: { col: "hidden @3xl:table-column", cell: "hidden @3xl:table-cell" },
  route: { col: "hidden @4xl:table-column", cell: "hidden @4xl:table-cell" },
} as const;

export function RequestsPanel() {
  const { tab, selectedId, select, clearHistory } = useToolbarTab();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const rows = tab.history
    .map((entry) => ({ entry, summary: summarize(entry.row, tab.details[entry.row.id]) }))
    .filter(
      ({ summary }) =>
        needle === "" ||
        summary.uri.toLowerCase().includes(needle) ||
        (summary.component ?? "").toLowerCase().includes(needle) ||
        (summary.routeName ?? "").toLowerCase().includes(needle),
    );
  return (
    <PanelShell
      icon={ListIcon}
      title="Requests"
      actions={
        <div className="flex items-center gap-2">
          <InputGroup className="w-64">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search URL or component"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          {/* sm matches the search field: same height and text size. */}
          <Button variant="outline" size="sm" type="button" onClick={clearHistory}>
            Clear
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow>{tab.history.length === 0 ? "No requests yet" : "No requests match"}</EmptyRow>
      ) : (
        <div className="@container">
          <table className={tableClass}>
            <colgroup>
              <col className="w-16" />
              <col className="w-18" />
              <col />
              <col className={cn("w-36", WIDE.component.col)} />
              <col className={cn("w-44", WIDE.route.col)} />
              <col className={cn("w-18", WIDE.type.col)} />
              <col className="w-20" />
              <col className="w-22" />
            </colgroup>
            <thead>
              <tr className={headRowClass}>
                <th className={headCellClass}>Status</th>
                <th className={headCellClass}>Method</th>
                <th className={headCellClass}>URI</th>
                <th className={cn(headCellClass, WIDE.component.cell)}>Component</th>
                <th className={cn(headCellClass, WIDE.route.cell)}>Route</th>
                <th className={cn(headCellClass, WIDE.type.cell)}>Type</th>
                <th className={cn(headCellClass, "text-right")}>Duration</th>
                <th className={cn(headCellClass, "text-right")}>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, summary }) => (
                <tr
                  key={summary.id}
                  onClick={() => select(summary.id)}
                  className={cn(
                    rowClass,
                    "cursor-pointer",
                    summary.id === selectedId && "bg-muted",
                  )}
                >
                  <td className={cellClass}>
                    {/* Follow-ups (a redirect's next hop, deferred props) sit under their page. */}
                    <span className="flex items-center gap-1.5">
                      {entry.row.follow_up ? (
                        <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                      ) : null}
                      <StatusBadge status={summary.status} />
                    </span>
                  </td>
                  <td className={cn(cellClass, "font-mono text-muted-foreground")}>
                    {summary.method}
                  </td>
                  <td className={cn(cellClass, "truncate font-mono")}>{summary.uri}</td>
                  <td className={cn(cellClass, "truncate font-mono", WIDE.component.cell)}>
                    {summary.component ?? <span className="text-muted-foreground">–</span>}
                  </td>
                  <td className={cn(cellClass, "truncate text-muted-foreground", WIDE.route.cell)}>
                    {summary.routeName ?? "–"}
                  </td>
                  <td className={cn(cellClass, "text-muted-foreground", WIDE.type.cell)}>
                    {KIND_LABEL[summary.kind]}
                  </td>
                  <td className={cn(cellClass, "text-right tabular-nums")}>
                    {summary.duration ?? "–"}
                  </td>
                  <td className={cn(cellClass, "text-right text-muted-foreground tabular-nums")}>
                    {clockTime(entry.receivedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}

// ─── Request: the selected request in detail ────────────────────────────────

function Scalar({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="text-success-foreground">"{value}"</span>;
  if (typeof value === "number") return <span className="text-info-foreground">{value}</span>;
  if (typeof value === "boolean")
    return <span className="text-warning-foreground">{String(value)}</span>;
  if (value === undefined) return <span className="text-muted-foreground">not loaded yet</span>;
  return <span className="text-muted-foreground">null</span>;
}

function isBranch(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

const BADGE_VARIANT = {
  Shared: "info",
  Always: "success",
  Deferred: "warning",
  Optional: "outline",
  Merge: "outline",
  Scroll: "outline",
  Once: "outline",
} as const;

/** What Inertia knows about a top-level prop: its badges and where it is defined. */
function PropAside({
  prop,
  openSource,
}: {
  prop: PropRow;
  openSource: ((target: string) => void) | undefined;
}) {
  const { source } = prop;
  return (
    <>
      {prop.badges.map((badge) => (
        <Badge key={badge} variant={BADGE_VARIANT[badge]}>
          {badge}
        </Badge>
      ))}
      {source ? (
        <SourceLink
          onOpen={openSource ? () => openSource(`${source.file}:${source.line}`) : undefined}
        >
          {shortLocation(source.file, source.line)}
        </SourceLink>
      ) : null}
    </>
  );
}

/** One prop in the tree. Objects and arrays fold open with a chevron. */
function PropNode({
  name,
  value,
  depth,
  aside,
}: {
  name: string;
  value: unknown;
  depth: number;
  /** Badges and source link on the right of a top-level prop. */
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const branch = isBranch(value);
  const entries = branch ? Object.entries(value) : [];
  const count = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div className={cn(depth === 0 && "border-b")}>
      <div
        className={cn(
          "flex items-center gap-1.5 pr-3 font-mono text-xs",
          depth === 0 ? "py-2.5" : "py-1.5",
        )}
      >
        {branch && entries.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronRight
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span>{name}</span>
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-3.5" />
            <span>
              {name}
              {branch ? null : <span className="text-muted-foreground">:</span>}
            </span>
          </span>
        )}
        {branch ? <span className="text-muted-foreground">{count}</span> : <Scalar value={value} />}
        {aside ? <span className="ml-auto flex shrink-0 items-center gap-1.5">{aside}</span> : null}
      </div>
      {branch && open ? (
        <div className="mb-1.5 ml-4 border-l pl-3">
          {entries.map(([key, child]) => (
            <PropNode key={key} name={key} value={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type RequestTab = "route" | "props" | "request" | "response" | "cookies";

export function RequestPanel() {
  const { selected, tab: toolbarTab, selectedId, openSource } = useToolbarTab();
  const [tab, setTab] = useState<RequestTab>("route");
  const row = toolbarTab.history.find((entry) => entry.row.id === selectedId)?.row;
  const summary = row ? summarize(row, selected) : null;
  const props = propRows(selected);
  const componentPath = selected?.inertia?.component_path ?? null;
  const cookies = selected?.response?.cookies ?? [];
  const contentType = selected?.response?.content_type ?? "";
  const responseKind = selected?.request?.is_inertia
    ? "Inertia"
    : contentType.includes("json")
      ? "JSON"
      : contentType.includes("html")
        ? "HTML"
        : contentType || "–";

  let body: ReactNode;
  if (!selected) body = <EmptyRow>Loading request…</EmptyRow>;
  else if (tab === "route")
    body = (
      <>
        <StatStrip>
          <Stat
            icon={Globe}
            label="Status"
            value={summary?.status ?? "–"}
            tone={
              (summary?.status ?? 0) >= 400
                ? "warning"
                : (summary?.status ?? 0) >= 300
                  ? "default"
                  : "success"
            }
            hint={
              selected.response?.redirect_to
                ? `Redirect to ${selected.response.redirect_to}`
                : undefined
            }
          />
          <Stat icon={Timer} label="Duration" value={summary?.duration ?? "–"} hint="Wall time" />
          <Stat
            icon={Layers}
            label="Memory"
            value={selected.profiler?.total_allocated_memory?.formattedValue ?? "–"}
            hint="Peak allocated"
          />
          <Stat
            icon={Box}
            label="Response"
            value={responseKind}
            hint={summary?.size ?? undefined}
          />
        </StatStrip>
        <Section title="Route">
          <KeyValueRows
            rows={[
              ["Name", selected.request?.route_name ?? "–", "mono"],
              ["URI", selected.request?.route_uri ?? selected.request?.uri ?? "–", "mono"],
              ["Action", selected.request?.controller_action ?? "–", "mono"],
              ["Client IP", selected.request?.ip_address ?? "–", "mono"],
            ]}
          />
        </Section>
        {(selected.request?.middleware ?? []).length > 0 ? (
          <Section
            title="Middleware"
            aside={`${selected.request?.middleware?.length} in order`}
            inset
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {(selected.request?.middleware ?? []).map((middleware, index) => (
                <span key={middleware.class} className="inline-flex items-center gap-1.5">
                  {index > 0 ? <span className="text-muted-foreground">→</span> : null}
                  <Badge variant="outline">
                    <span className="font-mono">{middleware.class.split("\\").pop()}</span>
                  </Badge>
                </span>
              ))}
            </div>
          </Section>
        ) : null}
      </>
    );
  else if (tab === "props")
    body =
      props.length > 0 ? (
        <div className="pl-1.5">
          {props.map((prop) => (
            <PropNode
              key={prop.name}
              name={prop.name}
              value={prop.loaded ? prop.value : undefined}
              depth={0}
              aside={<PropAside prop={prop} openSource={openSource} />}
            />
          ))}
        </div>
      ) : (
        <EmptyRow>No page props in this request</EmptyRow>
      );
  else if (tab === "cookies")
    body =
      cookies.length === 0 ? (
        <EmptyRow>The response set no cookies</EmptyRow>
      ) : (
        <table className={tableClass}>
          <colgroup>
            <col className="w-[22%]" />
            <col />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className={headRowClass}>
              <th className={headCellClass}>Name</th>
              <th className={headCellClass}>Value</th>
              <th className={headCellClass}>Path</th>
              <th className={headCellClass}>SameSite</th>
              <th className={headCellClass}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {cookies.map((cookie) => (
              <tr key={cookie.name} className={rowClass}>
                <td className={cn(cellClass, "truncate font-mono")}>{cookie.name}</td>
                <td className={cn(cellClass, "truncate font-mono text-muted-foreground")}>
                  {cookie.value}
                </td>
                <td className={cn(cellClass, "font-mono text-muted-foreground")}>
                  {cookie.path ?? "/"}
                </td>
                <td className={cn(cellClass, "text-muted-foreground")}>
                  {cookie.same_site ?? "–"}
                </td>
                <td className={cellClass}>
                  <div className="flex gap-1">
                    {cookie.secure ? <Badge variant="outline">Secure</Badge> : null}
                    {cookie.http_only ? <Badge variant="outline">HttpOnly</Badge> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  else
    body = (
      <KeyValueRows
        mono
        rows={headerRows(
          tab === "request" ? selected.request?.headers : selected.response?.headers,
        )}
      />
    );

  return (
    <PanelShell
      icon={Globe}
      title="Request"
      flush
      meta={
        summary ? (
          <>
            <StatusBadge status={summary.status} />
            <MethodBadge method={summary.method} />
            <span className="truncate font-mono text-foreground">{summary.uri}</span>
            {summary.component ? (
              <SourceLink
                onOpen={componentPath && openSource ? () => openSource(componentPath) : undefined}
              >
                {summary.component}
              </SourceLink>
            ) : null}
          </>
        ) : null
      }
      actions={
        summary ? (
          <span className="text-muted-foreground text-xs">{KIND_LABEL[summary.kind]}</span>
        ) : null
      }
    >
      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["route", "Route"],
          ["props", "Props"],
          ["request", "Request headers"],
          ["response", "Response headers"],
          ["cookies", "Cookies"],
        ]}
      />
      <ScrollArea radius="none" scrollFade hideScrollbars className="min-h-0 flex-1">
        {body}
      </ScrollArea>
    </PanelShell>
  );
}
