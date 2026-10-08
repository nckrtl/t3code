import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { ChevronDown, CircleAlert, Database, KeyRound, Play, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "~/components/ui/menu";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { createTerminalOrbitTransport } from "~/orbit/orbitTransport";
import { useOrbitThreadStore } from "~/orbit/orbitThreadStore";

import { ApiTabs } from "../api/ApiTabs";
import { ToolbarGroup } from "../components/ToolbarGroup";
import {
  browseTableSql,
  type DatabaseColumn,
  type DatabaseConnection,
  type DatabaseQueryResult,
  type DatabaseValue,
  defaultConnection,
  describeDatabaseTable,
  isSqlConnection,
  listDatabaseConnections,
  listDatabaseTables,
  runReadOnlyQuery,
} from "./databaseApi";
import { useDatabaseStore } from "./databaseStore";

type ResultTab = "rows" | "structure";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-1 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-ui text-warning">
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Cell({ value }: { value: DatabaseValue | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/70 italic">NULL</span>;
  }
  return <>{String(value)}</>;
}

function RowsGrid({ result }: { result: DatabaseQueryResult }) {
  if (result.columns.length === 0) {
    return (
      <p className="px-4 py-3 text-muted-foreground text-ui">The query returned no columns.</p>
    );
  }
  return (
    <table className="w-max min-w-full border-separate border-spacing-0 text-left font-mono text-xs">
      <thead>
        <tr>
          {result.columns.map((column) => (
            <th
              key={column}
              className="sticky top-0 z-10 h-8 border-b border-(--shell-divider)! bg-background px-3 font-medium text-muted-foreground first:ps-4"
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, index) => (
          // Rows have no stable identity; the result is replaced as a whole.
          // eslint-disable-next-line react/no-array-index-key
          <tr key={index} className="hover:bg-foreground/4">
            {result.columns.map((column) => (
              <td
                key={column}
                className="max-w-72 truncate border-b border-(--shell-divider)! px-3 py-1.5 first:ps-4"
              >
                <Cell value={row[column]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StructureList({ columns }: { columns: readonly DatabaseColumn[] }) {
  return (
    <div className="flex flex-col pb-2">
      {columns.map((column) => (
        <div
          key={column.name}
          className="flex items-center gap-3 border-b border-(--shell-divider)! py-2 ps-4 pe-toolbar-end text-ui"
        >
          <span className="flex w-2/5 min-w-0 items-center gap-1.5 font-mono text-xs">
            <span className="truncate">{column.name}</span>
            {column.primary ? (
              <KeyRound aria-label="Primary key" className="size-3.5 shrink-0 text-warning" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
            {column.type}
            {column.nullable ? " · nullable" : ""}
            {column.default !== null ? ` · default ${column.default}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

interface QueryState {
  readonly slug: string;
  readonly running: boolean;
  readonly result: DatabaseQueryResult | null;
  readonly error: string | null;
}

interface LoadState<T> {
  readonly key: string;
  readonly data: T | null;
  readonly error: string | null;
}

/** Loads once per key; a new key shows loading until its own answer arrives. */
function useOrbitLoad<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (error: unknown) => !cancelled && setState({ key, data: null, error: message(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, load]);
  const settled = key !== null && state?.key === key ? state : null;
  return {
    data: settled?.data ?? null,
    error: settled?.error ?? null,
    loading: key !== null && settled === null,
  };
}

function ConnectionMenu({
  connections,
  selected,
  onSelect,
}: {
  connections: readonly DatabaseConnection[];
  selected: DatabaseConnection | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="xs" type="button" aria-label="Database connection" />}
      >
        <Database />
        <span className="truncate">{selected?.slug ?? "Choose a connection"}</span>
        {selected ? <span className="text-muted-foreground">{selected.driver}</span> : null}
        <ChevronDown />
      </MenuTrigger>
      <MenuPopup align="start" sideOffset={6}>
        <MenuRadioGroup
          value={selected?.slug ?? ""}
          onValueChange={(slug) => onSelect(String(slug))}
        >
          {connections.map((connection) => (
            <MenuRadioItem
              key={connection.slug}
              value={connection.slug}
              disabled={!isSqlConnection(connection)}
            >
              <span className="truncate">{connection.slug}</span>
              <span className="ms-auto ps-3 text-muted-foreground">
                {isSqlConnection(connection) ? connection.driver : `${connection.driver} (no SQL)`}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/**
 * The Database surface: Orbit's database connections, their tables, a table's columns and
 * read-only SQL. Orbit runs everything, from the thread's machine (see orbitTransport.ts).
 */
export function DatabasePanel({
  threadRef,
  projectKey,
  environmentId,
  cwd,
}: {
  threadRef: ScopedThreadRef;
  projectKey: string;
  environmentId: EnvironmentId;
  cwd: string;
}) {
  const transport = useMemo(
    () => createTerminalOrbitTransport({ environmentId, cwd }),
    [cwd, environmentId],
  );
  const threadKey = scopedThreadKey(threadRef);
  const instanceId = useOrbitThreadStore(
    (state) => state.byThreadKey[threadKey]?.instanceId ?? null,
  );
  const remembered = useDatabaseStore(
    (state) => state.byProjectKey[projectKey]?.connection ?? null,
  );
  const pending = useDatabaseStore((state) => state.pendingByThreadKey[threadKey] ?? null);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<ResultTab>("rows");
  // Picks and results remember the connection they belong to, so a switch shows nothing stale.
  const [picked, setPicked] = useState<{ slug: string; table: string } | null>(null);
  const [query, setQuery] = useState<QueryState | null>(null);
  const runId = useRef(0);

  const loadConnections = useCallback(() => listDatabaseConnections(transport), [transport]);
  const connectionsLoad = useOrbitLoad(`connections:${refreshNonce}`, loadConnections);
  const connections = connectionsLoad.data;
  const connection = connections ? defaultConnection(connections, instanceId, remembered) : null;
  const slug = connection?.slug ?? null;
  const table = picked && picked.slug === slug ? picked.table : null;

  const loadTables = useCallback(
    () => (slug ? listDatabaseTables(transport, slug) : Promise.resolve([])),
    [slug, transport],
  );
  const tablesLoad = useOrbitLoad(slug ? `tables:${slug}:${refreshNonce}` : null, loadTables);
  const loadColumns = useCallback(
    () => (slug && table ? describeDatabaseTable(transport, slug, table) : Promise.resolve([])),
    [slug, table, transport],
  );
  const columnsLoad = useOrbitLoad(slug && table ? `columns:${slug}:${table}` : null, loadColumns);
  const columns = columnsLoad.data;

  const sql = useDatabaseStore((state) =>
    slug ? (state.byProjectKey[projectKey]?.sqlByConnection[slug] ?? "") : "",
  );
  const setSql = (next: string) => {
    if (slug) useDatabaseStore.getState().setSql(projectKey, slug, next);
  };
  const current = query && query.slug === slug ? query : null;
  const result = current?.result ?? null;
  const running = current?.running ?? false;

  const run = useCallback(
    async (statement: string) => {
      if (!slug || statement.trim() === "") return;
      const id = ++runId.current;
      setTab("rows");
      setQuery((previous) => ({
        slug,
        running: true,
        result: previous?.slug === slug ? previous.result : null,
        error: null,
      }));
      try {
        const next = await runReadOnlyQuery(transport, slug, statement);
        if (id === runId.current) setQuery({ slug, running: false, result: next, error: null });
      } catch (error) {
        if (id === runId.current) {
          setQuery({ slug, running: false, result: null, error: message(error) });
        }
      }
    },
    [slug, transport],
  );

  // A query handed over from the Laravel Toolbar runs once the connection is known.
  useEffect(() => {
    if (!pending || !slug) return;
    useDatabaseStore.getState().setSql(projectKey, slug, pending.sql);
    useDatabaseStore.getState().clearPending(threadKey, pending.nonce);
    void run(pending.sql);
  }, [pending, projectKey, run, slug, threadKey]);

  const openTable = (name: string) => {
    if (!connection) return;
    const statement = browseTableSql(connection.driver, name);
    setPicked({ slug: connection.slug, table: name });
    setSql(statement);
    void run(statement);
  };

  const tables = tablesLoad.data;
  const visibleTables = (tables ?? []).filter((name) =>
    name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-background"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void run(sql);
        }
      }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-(--shell-divider)! bg-background py-toolbar ps-2 pe-toolbar-end"
        data-surface-subheader
      >
        <ToolbarGroup role="group" aria-label="Connection" className="min-w-0">
          <ConnectionMenu
            connections={connections ?? []}
            selected={connection}
            onSelect={(next) => useDatabaseStore.getState().setConnection(projectKey, next)}
          />
        </ToolbarGroup>
        <span className="ms-auto shrink-0 text-muted-foreground text-ui">Read-only</span>
        <ToolbarGroup role="group" aria-label="Refresh">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  aria-label="Refresh"
                  onClick={() => setRefreshNonce((value) => value + 1)}
                />
              }
            >
              <RefreshIcon refreshing={connectionsLoad.loading} />
            </TooltipTrigger>
            <TooltipPopup>Refresh connections and tables</TooltipPopup>
          </Tooltip>
        </ToolbarGroup>
      </div>
      {connectionsLoad.error ? <Notice>{connectionsLoad.error}</Notice> : null}
      {connections && !connection ? (
        <p className="px-4 py-3 text-muted-foreground text-ui">
          Orbit has no SQL database connections yet.
        </p>
      ) : null}
      {connection ? (
        <div className="flex min-h-0 flex-1">
          <div className="shell-divider-r flex w-52 shrink-0 flex-col">
            <div className="shrink-0 p-2">
              <InputGroup variant="soft" className="h-8">
                <InputGroupAddon>
                  <Search aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Tables"
                  aria-label="Filter tables"
                />
              </InputGroup>
            </div>
            <div className="scrollbar-inset min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
              {tablesLoad.error ? <Notice>{tablesLoad.error}</Notice> : null}
              {tablesLoad.loading ? (
                <div className="flex justify-center py-3 text-muted-foreground">
                  <Spinner className="size-4" />
                </div>
              ) : null}
              {tables && visibleTables.length === 0 ? (
                <p className="px-2.5 py-2 text-muted-foreground text-ui">No tables</p>
              ) : null}
              {visibleTables.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => openTable(name)}
                  className={cn(
                    "flex h-7 w-full cursor-pointer items-center rounded-(--control-radius) px-2.5 text-left text-ui outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    name === table
                      ? "bg-(--shell-highlight) text-foreground"
                      : "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
                  )}
                >
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <textarea
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              placeholder="select * from users limit 100"
              aria-label="SQL query"
              spellCheck={false}
              rows={5}
              className="block max-h-[40%] min-h-24 w-full shrink-0 resize-y border-b border-(--shell-divider)! bg-transparent px-4 py-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <ApiTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "rows", label: "Rows", count: result?.rowCount },
                { id: "structure", label: "Structure", count: columns?.length },
              ]}
              trailing={
                <>
                  {result?.truncated ? (
                    <span className="text-muted-foreground text-ui">First 500 rows</span>
                  ) : null}
                  <ToolbarGroup>
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      onClick={() => void run(sql)}
                      disabled={running || sql.trim() === ""}
                    >
                      {running ? <Spinner className="size-3.5" /> : <Play />}
                      Run
                    </Button>
                  </ToolbarGroup>
                </>
              }
            />
            <div className="scrollbar-gutter-both scrollbar-inset min-h-0 flex-1 overflow-auto">
              {tab === "rows" ? (
                current?.error ? (
                  <Notice>{current.error}</Notice>
                ) : result ? (
                  <RowsGrid result={result} />
                ) : (
                  <p className="px-4 py-3 text-muted-foreground text-ui">
                    {running ? "Running…" : "Pick a table, or write a query and press ⌘↵."}
                  </p>
                )
              ) : !table ? (
                <p className="px-4 py-3 text-muted-foreground text-ui">
                  Pick a table to see its columns.
                </p>
              ) : columnsLoad.error ? (
                <Notice>{columnsLoad.error}</Notice>
              ) : columns ? (
                <StructureList columns={columns} />
              ) : (
                <div className="flex justify-center py-3 text-muted-foreground">
                  <Spinner className="size-4" />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
