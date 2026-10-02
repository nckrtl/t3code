import { describe, expect, it } from "vite-plus/test";

import { formatBytes, requestKind, rowFromData, stages, summarize } from "./model";
import type { ToolbarData } from "./types";

const page: ToolbarData = {
  request_id: "r1",
  profiler: {
    total_wall_time: { formattedValue: "41ms", value: 41.27 },
    stages: [
      { label: "Bootstrapping", color: "#FC3D46", wall_time: { measurement: { value: 8.28 } } },
      {
        label: "Controller",
        color: "#64BAFF",
        wall_time: { measurement: { value: 1 } },
        memory_real_delta: { measurement: { value: 26368 } },
      },
    ],
  },
  request: { method: "GET", uri: "/", route_name: "home", is_inertia: true, view_name: "Home" },
  response: { status_code: 200, size: "9.97 KB" },
};

describe("laravel toolbar model", () => {
  it("reads the response size as text or as a measurement", () => {
    const measured = { ...page, response: { size: { formattedValue: "9.97 KB", value: 10209 } } };
    expect(summarize(rowFromData(measured)!, measured).size).toBe("9.97 KB");
    expect(summarize(rowFromData(page)!, page).size).toBe("9.97 KB");
  });

  it("lays stages end to end", () => {
    expect(stages(page).map((stage) => [stage.label, stage.startMs])).toEqual([
      ["Bootstrapping", 0],
      ["Controller", 8.28],
    ]);
  });

  it("builds a history row for a page load that sent none", () => {
    expect(rowFromData(page)).toMatchObject({ id: "r1", is_xhr: false, status_code: 200 });
  });

  it("tells page loads, Inertia visits and plain XHR apart", () => {
    expect(requestKind({ is_xhr: false })).toBe("page");
    expect(requestKind({ is_xhr: true, response_type: "Inertia" })).toBe("inertia");
    expect(requestKind({ is_xhr: true, response_type: null })).toBe("xhr");
  });

  it("completes a history row with its loaded payload", () => {
    const summary = summarize({ id: "r1", method: "GET", uri: "/", duration: "40ms" }, page);
    expect(summary).toMatchObject({ component: "Home", duration: "41ms", status: 200 });
  });

  it("formats freed memory with a sign", () => {
    expect(formatBytes(-14162)).toBe("-13.83 KB");
  });
});
