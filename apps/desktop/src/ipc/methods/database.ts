import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import mysql from "mysql2/promise";
import * as NodeSqlite from "node:sqlite";
import postgres from "postgres";

import * as DesktopIpc from "../DesktopIpc.ts";
import { DATABASE_RUN_CHANNEL } from "../channels.ts";

// The Database panel's runner. The desktop main process connects directly (no T3 server
// change), opens one connection per call and closes it again. Everything is read-only:
// only reading statements may run, inside a read-only transaction that is rolled back
// (SQLite opens the file read-only instead).

const ROW_LIMIT = 500;
const TIMEOUT_SECONDS = 30;

const Connection = Schema.Struct({
  driver: Schema.Literals(["mysql", "pgsql", "sqlite"]),
  host: Schema.String,
  port: Schema.NullOr(Schema.Int),
  database: Schema.String,
  username: Schema.String,
  password: Schema.String,
});

const DatabaseRequest = Schema.Struct({
  connection: Connection,
  operation: Schema.Literals(["tables", "describe", "query"]),
  table: Schema.optional(Schema.String),
  sql: Schema.optional(Schema.String.check(Schema.isMaxLength(200_000))),
});

const Column = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  nullable: Schema.Boolean,
  default: Schema.NullOr(Schema.String),
  primary: Schema.Boolean,
});

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]);

const DatabaseResponse = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  tables: Schema.Array(Schema.String),
  columns: Schema.Array(Column),
  resultColumns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Record(Schema.String, Value)),
  rowCount: Schema.Int,
  truncated: Schema.Boolean,
  durationMs: Schema.Number,
});

type Request = typeof DatabaseRequest.Type;
type Response = typeof DatabaseResponse.Type;
type Column = typeof Column.Type;
type CellValue = typeof Value.Type;
type Row = Record<string, CellValue>;

interface Rows {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
}

const READING_STATEMENT = /^(select|with|show|describe|desc|explain|values|table|pragma)\b/i;

/** Drops leading comments, so `-- note\nselect 1` counts as a select. */
function firstKeyword(sql: string): string {
  return sql.replace(/^(\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, "").trimStart();
}

function assertReading(sql: string): void {
  if (!READING_STATEMENT.test(firstKeyword(sql))) {
    throw new Error(
      "The Database panel is read-only. Run select, with, show, describe or explain statements.",
    );
  }
}

/** Values the panel can show: dates as ISO text, binary as hex, big numbers as text. */
function cell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value.subarray(0, 64)).toString("hex");
    return `0x${hex}${value.byteLength > 64 ? `… (${value.byteLength} bytes)` : ""}`;
  }
  return JSON.stringify(value);
}

function limitRows(
  result: Rows,
): Pick<Response, "resultColumns" | "rows" | "rowCount" | "truncated"> {
  const kept = result.rows.slice(0, ROW_LIMIT).map((row) => {
    const out: Row = {};
    for (const column of result.columns) out[column] = cell(row[column]);
    return out;
  });
  return {
    resultColumns: [...result.columns],
    rows: kept,
    rowCount: result.rows.length,
    truncated: result.rows.length > ROW_LIMIT,
  };
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

// ─── MySQL / MariaDB ─────────────────────────────────────────────────────────

async function withMysql<T>(
  connection: Request["connection"],
  run: (client: mysql.Connection) => Promise<T>,
): Promise<T> {
  const client = await mysql.createConnection({
    host: connection.host || "127.0.0.1",
    port: connection.port ?? 3306,
    user: connection.username,
    password: connection.password,
    database: connection.database,
    connectTimeout: 10_000,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  });
  try {
    await client.query("START TRANSACTION READ ONLY");
    try {
      return await run(client);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  } finally {
    await client.end().catch(() => client.destroy());
  }
}

async function mysqlRows(client: mysql.Connection, sql: string, values: unknown[] = []) {
  const [rows, fields] = await client.query({ sql, values, timeout: TIMEOUT_SECONDS * 1000 });
  if (!Array.isArray(rows)) return { columns: [], rows: [] };
  return {
    columns: (fields ?? []).map((field) => field.name),
    rows: rows as Record<string, unknown>[],
  };
}

async function runMysql(request: Request): Promise<Partial<Response>> {
  return withMysql(request.connection, async (client) => {
    if (request.operation === "tables") {
      const result = await mysqlRows(
        client,
        "select table_name as name from information_schema.tables where table_schema = database() order by table_name",
      );
      return { tables: result.rows.map((row) => text(row.name ?? row.NAME ?? row.TABLE_NAME)) };
    }
    if (request.operation === "describe") {
      const result = await mysqlRows(
        client,
        "select column_name as name, column_type as type, is_nullable as nullable, column_default as dflt, column_key as ckey from information_schema.columns where table_schema = database() and table_name = ? order by ordinal_position",
        [request.table ?? ""],
      );
      return {
        columns: result.rows.map((row) => ({
          name: text(row.name),
          type: text(row.type),
          nullable: text(row.nullable) === "YES",
          default: row.dflt === null || row.dflt === undefined ? null : text(row.dflt),
          primary: text(row.ckey) === "PRI",
        })),
      };
    }
    return limitRows(await mysqlRows(client, request.sql ?? ""));
  });
}

// ─── PostgreSQL ──────────────────────────────────────────────────────────────

async function withPostgres<T>(
  connection: Request["connection"],
  run: (client: postgres.ReservedSql) => Promise<T>,
): Promise<T> {
  const sql = postgres({
    host: connection.host || "127.0.0.1",
    port: connection.port ?? 5432,
    user: connection.username,
    password: connection.password,
    database: connection.database,
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 1,
    onnotice: () => undefined,
  });
  try {
    const client = await sql.reserve();
    try {
      await client.unsafe(`set statement_timeout = ${TIMEOUT_SECONDS * 1000}`);
      await client.unsafe("begin read only");
      try {
        return await run(client);
      } finally {
        await client.unsafe("rollback").catch(() => undefined);
      }
    } finally {
      client.release();
    }
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function postgresRows(
  client: postgres.ReservedSql,
  sql: string,
  values: postgres.ParameterOrJSON<never>[] = [],
): Promise<Rows> {
  const result = await client.unsafe(sql, values);
  return {
    columns: (result.columns ?? []).map((column) => column.name),
    rows: [...result] as Record<string, unknown>[],
  };
}

/** `schema.table` or a bare table in `public`. */
function postgresTable(name: string): [string, string] {
  const dot = name.indexOf(".");
  return dot === -1 ? ["public", name] : [name.slice(0, dot), name.slice(dot + 1)];
}

async function runPostgres(request: Request): Promise<Partial<Response>> {
  return withPostgres(request.connection, async (client) => {
    if (request.operation === "tables") {
      const result = await postgresRows(
        client,
        "select case when table_schema = 'public' then table_name else table_schema || '.' || table_name end as name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by 1",
      );
      return { tables: result.rows.map((row) => text(row.name)) };
    }
    if (request.operation === "describe") {
      const [schema, table] = postgresTable(request.table ?? "");
      const result = await postgresRows(
        client,
        `select c.column_name as name, c.data_type as type, c.is_nullable as nullable, c.column_default as dflt,
           exists (
             select 1 from information_schema.table_constraints t
             join information_schema.key_column_usage k
               on k.constraint_name = t.constraint_name and k.table_schema = t.table_schema
             where t.constraint_type = 'PRIMARY KEY' and k.table_schema = c.table_schema
               and k.table_name = c.table_name and k.column_name = c.column_name
           ) as pk
         from information_schema.columns c
         where c.table_schema = $1 and c.table_name = $2
         order by c.ordinal_position`,
        [schema, table],
      );
      return {
        columns: result.rows.map((row) => ({
          name: text(row.name),
          type: text(row.type),
          nullable: text(row.nullable) === "YES",
          default: row.dflt === null || row.dflt === undefined ? null : text(row.dflt),
          primary: row.pk === true,
        })),
      };
    }
    return limitRows(await postgresRows(client, request.sql ?? ""));
  });
}

// ─── SQLite ──────────────────────────────────────────────────────────────────

function withSqlite<T>(
  connection: Request["connection"],
  run: (db: NodeSqlite.DatabaseSync) => T,
): T {
  const db = new NodeSqlite.DatabaseSync(connection.database, { readOnly: true });
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function sqliteRows(db: NodeSqlite.DatabaseSync, sql: string): Rows {
  const statement = db.prepare(sql);
  const rows = statement.all() as Record<string, unknown>[];
  const columns = statement.columns().map((column) => column.name);
  return { columns, rows };
}

function runSqlite(request: Request): Partial<Response> {
  return withSqlite(request.connection, (db) => {
    if (request.operation === "tables") {
      return {
        tables: sqliteRows(
          db,
          "select name from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%' order by name",
        ).rows.map((row) => text(row.name)),
      };
    }
    if (request.operation === "describe") {
      const table = (request.table ?? "").replace(/"/g, '""');
      return {
        columns: sqliteRows(db, `pragma table_info("${table}")`).rows.map((row): Column => ({
          name: text(row.name),
          type: text(row.type),
          nullable: Number(row.notnull) === 0,
          default:
            row.dflt_value === null || row.dflt_value === undefined ? null : text(row.dflt_value),
          primary: Number(row.pk) > 0,
        })),
      };
    }
    return limitRows(sqliteRows(db, request.sql ?? ""));
  });
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const EMPTY: Response = {
  error: null,
  tables: [],
  columns: [],
  resultColumns: [],
  rows: [],
  rowCount: 0,
  truncated: false,
  durationMs: 0,
};

export async function runDatabase(request: Request): Promise<Response> {
  const started = performance.now();
  const durationMs = () => Math.round((performance.now() - started) * 10) / 10;
  try {
    if (request.operation === "query") assertReading(request.sql ?? "");
    const result =
      request.connection.driver === "mysql"
        ? await runMysql(request)
        : request.connection.driver === "pgsql"
          ? await runPostgres(request)
          : runSqlite(request);
    return { ...EMPTY, ...result, durationMs: durationMs() };
  } catch (error) {
    return {
      ...EMPTY,
      error: error instanceof Error ? error.message : String(error),
      durationMs: durationMs(),
    };
  }
}

export const databaseRun = DesktopIpc.makeIpcMethod({
  channel: DATABASE_RUN_CHANNEL,
  payload: DatabaseRequest,
  result: DatabaseResponse,
  handler: Effect.fn("desktop.ipc.database.run")(function* (request) {
    return yield* Effect.promise(() => runDatabase(request));
  }),
});
