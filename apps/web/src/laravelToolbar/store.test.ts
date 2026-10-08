import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useLaravelToolbarStore } from "./store";

const TAB = "tab";
const state = () => useLaravelToolbarStore.getState().byTabId[TAB]!;

describe("laravel toolbar store", () => {
  beforeEach(() => useLaravelToolbarStore.setState({ byTabId: {} }));

  it("starts over on a page load", () => {
    useLaravelToolbarStore.getState().receivePage(TAB, {
      request_id: "r1",
      profiler: { stages: [] },
      request: { method: "GET", uri: "/" },
    });
    expect(state().currentId).toBe("r1");
    expect(state().history.map((entry) => entry.row.id)).toEqual(["r1"]);
  });

  it("keeps the server's row for the page, with its follow-up mark", () => {
    useLaravelToolbarStore.getState().receivePage(TAB, {
      request_id: "r2",
      profiler: {},
      request_history: [
        { id: "r1", method: "GET", uri: "/old", status_code: 302 },
        { id: "r2", method: "GET", uri: "/new", follow_up: "redirect" },
      ],
    });
    expect(state().history.map((entry) => entry.row.follow_up ?? null)).toEqual([null, "redirect"]);
  });

  it("adds a summary row for a later request", () => {
    useLaravelToolbarStore.getState().receivePage(TAB, { request_id: "r1", profiler: {} });
    useLaravelToolbarStore.getState().receiveUpdate(TAB, {
      request_id: "r2",
      history_row: { id: "r2", method: "GET", uri: "/api" },
    });
    expect(state().history.map((entry) => entry.row.id)).toEqual(["r1", "r2"]);
    expect(state().currentId).toBe("r1");
  });

  it("replaces the state when an Inertia visit sends the history", () => {
    useLaravelToolbarStore.getState().receivePage(TAB, { request_id: "r1", profiler: {} });
    useLaravelToolbarStore.getState().receiveUpdate(TAB, {
      request_id: "r3",
      selected_request_id: "r3",
      request_history: [
        { id: "r1", method: "GET", uri: "/" },
        { id: "r3", method: "GET", uri: "/download" },
      ],
    });
    expect(state().currentId).toBe("r3");
    expect(state().history.map((entry) => entry.row.id)).toEqual(["r1", "r3"]);
  });
  it("makes a request sent from the API panel current and keeps the earlier ones", () => {
    const store = useLaravelToolbarStore.getState();
    store.receiveRequest(TAB, { id: "a", method: "GET", uri: "/api/users" }, { request_id: "a" });
    store.receiveRequest(TAB, { id: "b", method: "POST", uri: "/api/users" }, null);
    expect(state().currentId).toBe("b");
    expect(state().history.map((entry) => entry.row.id)).toEqual(["a", "b"]);
    expect(Object.keys(state().details)).toEqual(["a"]);
  });
});
