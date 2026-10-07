import { describe, expect, it } from "vite-plus/test";

import { stripAnsi } from "./stripAnsi";

describe("stripAnsi", () => {
  it("removes color sequences and keeps the text", () => {
    expect(stripAnsi("\u001B[1;37m{\u001B[m")).toBe("{");
    expect(stripAnsi("plain text")).toBe("plain text");
  });
});
