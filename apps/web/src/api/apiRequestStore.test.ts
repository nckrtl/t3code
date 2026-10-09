import { beforeEach, describe, expect, it } from "vite-plus/test";

import { apiRequestLabel, newApiRequest, useApiRequestStore } from "./apiRequestStore";

const PROJECT = "env:/repo";
const project = () => useApiRequestStore.getState().byProjectKey[PROJECT]!;

describe("api request store", () => {
  beforeEach(() => useApiRequestStore.setState({ byProjectKey: {}, results: {} }));

  it("starts new requests at the app URL, asking for JSON and the toolbar header", () => {
    const request = newApiRequest("https://app.test");
    expect(request.url).toBe("https://app.test/");
    expect(request.headers.map((row) => `${row.name}: ${row.value}`)).toEqual([
      "Accept: application/json",
      "X-Toolbar: 1",
    ]);
  });

  it("labels a request by method and path", () => {
    expect(apiRequestLabel({ method: "POST", url: "https://app.test/api/users?page=2" })).toBe(
      "POST /api/users?page=2",
    );
    expect(apiRequestLabel({ method: "GET", url: "" })).toBe("GET New request");
  });

  it("selects the neighbour when the selected request is deleted", () => {
    const store = useApiRequestStore.getState();
    const first = newApiRequest(null);
    const second = newApiRequest(null);
    store.add(PROJECT, first);
    store.add(PROJECT, second);
    store.setResult(second.id, { response: null, sending: false });
    useApiRequestStore.getState().remove(PROJECT, second.id);
    expect(project().requests.map((request) => request.id)).toEqual([first.id]);
    expect(project().selectedId).toBe(first.id);
    expect(useApiRequestStore.getState().results[second.id]).toBeUndefined();
  });
});
