import { describe, expect, it } from "vite-plus/test";

import { upstreamReleaseVersion } from "./roomsBuildVersion.ts";

describe("upstreamReleaseVersion", () => {
  it("drops the rooms build suffix", () => {
    expect(upstreamReleaseVersion("0.0.42-rooms.20260929")).toBe("0.0.42");
    expect(upstreamReleaseVersion("0.0.42-rooms.20260929.9")).toBe("0.0.42");
  });

  it("leaves upstream versions alone", () => {
    expect(upstreamReleaseVersion("0.0.42")).toBe("0.0.42");
    expect(upstreamReleaseVersion("0.0.43-preview.20260928.2413")).toBe(
      "0.0.43-preview.20260928.2413",
    );
  });
});
