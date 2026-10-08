// Orbit Gateway calls behind the Database panel. Orbit holds the connections and runs the
// SQL, so T3 needs no database drivers or credentials. Queries are always read-only here.
import { callOrbit, OrbitApiError } from "~/orbit/orbitApi";
import type { OrbitTransport } from "~/orbit/orbitTransport";

export interface DatabaseConnection {
  readonly slug: string;
  readonly driver: string;
  readonly database: string | null;
  readonly host: string | null;
  readonly server: string | null;
  readonly ownerInstanceId: number | null;
}

export interface DatabaseColumn {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly default: string | null;
  readonly primary: boolean;
}

export type DatabaseValue = string | number | boolean | null;

export interface DatabaseQueryResult {
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<Readonly<Record<string, DatabaseValue>>>;
  readonly rowCount: number;
  /** Orbit stops at 500 rows. */
  readonly truncated: boolean;
}

/** Drivers Orbit can list tables for and run SQL on; Redis connections are left out. */
const SQL_DRIVERS = new Set(["mysql", "mariadb", "pgsql", "postgres", "postgresql", "sqlite"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function invalid(what: string): OrbitApiError {
  return new OrbitApiError("orbit.response_invalid", `Orbit sent an invalid ${what}.`, 200);
}

export function isSqlConnection(connection: DatabaseConnection): boolean {
  return SQL_DRIVERS.has(connection.driver.toLowerCase());
}

export function parseConnections(data: unknown): DatabaseConnection[] {
  if (!Array.isArray(data)) throw invalid("connection list");
  return data.flatMap((item) => {
    const value = record(item);
    const slug = text(value?.slug);
    const driver = text(value?.driver);
    if (!value || !slug || !driver) return [];
    return [
      {
        slug,
        driver,
        database: text(value.database),
        host: text(value.host),
        server: text(value.server),
        ownerInstanceId:
          typeof value.owner_instance_id === "number" ? value.owner_instance_id : null,
      },
    ];
  });
}

export function parseTables(data: unknown): string[] {
  const tables = record(data)?.tables;
  if (!Array.isArray(tables)) throw invalid("table list");
  return tables.filter((table): table is string => typeof table === "string");
}

export function parseColumns(data: unknown): DatabaseColumn[] {
  const columns = record(data)?.columns;
  if (!Array.isArray(columns)) throw invalid("column list");
  return columns.flatMap((item) => {
    const value = record(item);
    const name = text(value?.name);
    if (!value || !name) return [];
    return [
      {
        name,
        type: text(value.type) ?? "",
        nullable: value.nullable === true,
        default:
          value.default === null || value.default === undefined ? null : String(value.default),
        primary: value.primary === true,
      },
    ];
  });
}

export function parseQueryResult(data: unknown): DatabaseQueryResult {
  const value = record(data);
  if (!value || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
    throw invalid("query result");
  }
  return {
    columns: value.columns.filter((column): column is string => typeof column === "string"),
    rows: value.rows.flatMap((row) => {
      const cells = record(row);
      return cells ? [cells as Record<string, DatabaseValue>] : [];
    }),
    rowCount: typeof value.row_count === "number" ? value.row_count : value.rows.length,
    truncated: value.truncated === true,
  };
}

const path = (slug: string, rest = "") =>
  `/api/v1/database-connections/${encodeURIComponent(slug)}${rest}`;

export async function listDatabaseConnections(
  transport: OrbitTransport,
): Promise<DatabaseConnection[]> {
  return parseConnections(
    await callOrbit(transport, { method: "GET", path: "/api/v1/database-connections" }),
  );
}

export async function listDatabaseTables(
  transport: OrbitTransport,
  slug: string,
): Promise<string[]> {
  return parseTables(await callOrbit(transport, { method: "GET", path: path(slug, "/tables") }));
}

export async function describeDatabaseTable(
  transport: OrbitTransport,
  slug: string,
  table: string,
): Promise<DatabaseColumn[]> {
  return parseColumns(
    await callOrbit(transport, {
      method: "GET",
      path: path(slug, `/describe/${encodeURIComponent(table)}`),
    }),
  );
}

export async function runReadOnlyQuery(
  transport: OrbitTransport,
  slug: string,
  sql: string,
): Promise<DatabaseQueryResult> {
  return parseQueryResult(
    await callOrbit(transport, {
      method: "POST",
      path: path(slug, "/query"),
      body: { sql, write: false },
    }),
  );
}

/** `select * from <table> limit 100`, with the driver's identifier quoting. */
export function browseTableSql(driver: string, table: string): string {
  const quoted = /mysql|mariadb/i.test(driver)
    ? `\`${table.replace(/`/g, "``")}\``
    : `"${table.replace(/"/g, '""')}"`;
  return `select * from ${quoted} limit 100`;
}

/** The connection picked before, else the one this thread's app owns, else the first SQL one. */
export function defaultConnection(
  connections: readonly DatabaseConnection[],
  instanceId: number | null,
  remembered: string | null,
): DatabaseConnection | null {
  const usable = connections.filter(isSqlConnection);
  return (
    usable.find((connection) => connection.slug === remembered) ??
    (instanceId === null
      ? undefined
      : usable.find((connection) => connection.ownerInstanceId === instanceId)) ??
    usable[0] ??
    null
  );
}
