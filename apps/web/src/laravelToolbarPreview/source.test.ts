import { describe, expect, it } from "vite-plus/test";

import { modelCount, wallTimeMs } from "~/laravelToolbar/model";

import { createPreviewSource } from "./source";

describe("toolbar preview data source", () => {
  it("returns recorded results for different requests and missing requests", async () => {
    const source = createPreviewSource();
    const page = await source.fetchDetails("r1");
    const xhr = await source.fetchDetails("r3");
    expect(page).not.toBeNull();
    expect(xhr).not.toBeNull();
    expect(wallTimeMs(page!)).toBe(41);
    expect(wallTimeMs(xhr!)).toBe(18);
    expect(modelCount(page!)).toBe(14);
    expect(modelCount(xhr!)).toBe(1);
    expect(xhr?.request?.uri).toBe("/api/releases/latest");
    expect(xhr?.queries?.queries).toHaveLength(1);
    expect(await source.fetchDetails("missing")).toBeNull();
  });

  it("simulates process controls and logs within each preview session", async () => {
    const first = createPreviewSource().orbit!;
    const second = createPreviewSource().orbit!;
    const page = (await first.page())!;
    const stopped = (await first.processes(page.instanceId)).find(
      (process) => process.status === "stopped",
    )!;
    await first.act(stopped.id, "start");
    expect(
      (await first.processes(page.instanceId)).find((process) => process.id === stopped.id)?.status,
    ).toBe("running");
    expect(await first.logs(stopped.id, 1)).toContain(`start ${stopped.name}`);
    expect(
      (await second.processes(page.instanceId)).find((process) => process.id === stopped.id)
        ?.status,
    ).toBe("stopped");
    await first.act(stopped.id, "stop");
    expect(
      (await first.processes(page.instanceId)).find((process) => process.id === stopped.id)?.status,
    ).toBe("stopped");
    await expect(first.act(-1, "start")).rejects.toThrow("Unknown preview process.");
  });
});
