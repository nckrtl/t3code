import { describe, expect, it } from "vite-plus/test";

import {
  browseTableSql,
  defaultConnection,
  parseColumns,
  parseConnections,
  parseQueryResult,
} from "./databaseApi";

// Shapes as the Orbit Gateway sends them (`data` of each response).
const CONNECTIONS = parseConnections([
  { slug: "beast-valkey", driver: "redis", owner_instance_id: null },
  { slug: "ohdear", driver: "mysql", database: "ohdear", owner_instance_id: 44 },
  { slug: "shop", driver: "pgsql", database: "shop", owner_instance_id: 7 },
]);

describe("database api", () => {
  it("prefers the picked connection, then the thread's app, and never Redis", () => {
    expect(defaultConnection(CONNECTIONS, 7, "ohdear")?.slug).toBe("ohdear");
    expect(defaultConnection(CONNECTIONS, 7, null)?.slug).toBe("shop");
    expect(defaultConnection(CONNECTIONS, null, "beast-valkey")?.slug).toBe("ohdear");
    expect(defaultConnection(CONNECTIONS.slice(0, 1), null, null)).toBeNull();
  });

  it("quotes table names the way the driver expects", () => {
    expect(browseTableSql("mysql", "order`s")).toBe("select * from `order``s` limit 100");
    expect(browseTableSql("pgsql", "users")).toBe('select * from "users" limit 100');
  });

  it("reads columns and query results", () => {
    expect(
      parseColumns({
        columns: [{ name: "id", type: "bigint", nullable: false, default: null, primary: true }],
      }),
    ).toEqual([{ name: "id", type: "bigint", nullable: false, default: null, primary: true }]);
    expect(
      parseQueryResult({
        columns: ["id", "name"],
        rows: [{ id: 1, name: null }],
        row_count: 1,
        truncated: false,
      }),
    ).toEqual({
      columns: ["id", "name"],
      rows: [{ id: 1, name: null }],
      rowCount: 1,
      truncated: false,
    });
    expect(() => parseQueryResult({ columns: "id" })).toThrow();
  });
});
