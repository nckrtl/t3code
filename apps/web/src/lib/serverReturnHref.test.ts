import { describe, expect, it } from "vite-plus/test";

import { serverReturnHref } from "./serverReturnHref";

describe("serverReturnHref", () => {
  it("gives a renamed desktop app's address to the server in upstream's scheme", () => {
    expect(serverReturnHref("conn://app/settings/providers?x=1#top")).toBe(
      "t3code://app/settings/providers?x=1#top",
    );
    expect(serverReturnHref("conn-dev://app/welcome")).toBe("t3code-dev://app/welcome");
  });

  it("leaves upstream's schemes, web addresses and other hosts alone", () => {
    for (const href of [
      "t3code://app/settings",
      "t3code-dev://app/settings",
      "https://app.t3.codes/settings",
      "http://localhost:5733/settings",
      "conn://other/settings",
      "not a url",
    ]) {
      expect(serverReturnHref(href)).toBe(href);
    }
  });
});
