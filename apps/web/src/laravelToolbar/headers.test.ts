import { describe, expect, it } from "vite-plus/test";

import { toolbarPayloadFromHeaders } from "./headers";

const base64 = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));

describe("toolbarPayloadFromHeaders", () => {
  it("reads the full payload from x-toolbar, in any header case", () => {
    const payload = toolbarPayloadFromHeaders([
      { name: "X-Toolbar", value: base64({ request_id: "abc", request: { uri: "/é" } }) },
    ]);
    expect(payload).toEqual({
      kind: "full",
      data: { request_id: "abc", request: { uri: "/é" } },
    });
  });

  it("falls back to the summary row when the payload is too big for a header", () => {
    const row = { id: "abc", method: "GET", uri: "/api/users" };
    expect(
      toolbarPayloadFromHeaders([
        { name: "x-toolbar-summary", value: base64({ request_id: "abc", history_row: row }) },
      ]),
    ).toEqual({ kind: "summary", id: "abc", row });
  });

  it("ignores responses without toolbar data or with broken data", () => {
    expect(toolbarPayloadFromHeaders([{ name: "content-type", value: "text/html" }])).toBeNull();
    expect(toolbarPayloadFromHeaders([{ name: "x-toolbar", value: "not base64 json" }])).toBeNull();
    expect(toolbarPayloadFromHeaders([{ name: "x-toolbar", value: base64([1, 2]) }])).toBeNull();
  });
});
