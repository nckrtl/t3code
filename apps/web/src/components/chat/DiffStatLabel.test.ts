import { describe, expect, it } from "vite-plus/test";

import { diffStatColumnsStyle } from "./DiffStatLabel";

describe("diffStatColumnsStyle", () => {
  it("sizes each column to the largest count in the list, sign included", () => {
    expect(
      diffStatColumnsStyle([
        { additions: 2, deletions: 2 },
        { additions: 120, deletions: 5 },
        null,
      ]),
    ).toMatchObject({
      "--diff-stat-additions-width": "4ch",
      "--diff-stat-deletions-width": "2ch",
    });
  });

  it("measures compact counts as they are shown", () => {
    expect(diffStatColumnsStyle([{ additions: 12_345, deletions: 0 }])).toMatchObject({
      "--diff-stat-additions-width": "4ch",
    });
  });
});
