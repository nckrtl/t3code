import { describe, expect, it } from "vite-plus/test";

import { REDACTED_VALUE, redactSensitiveValues } from "./credentialFill.ts";

const SECRET = "hunter2-correct&horse";

describe("redactSensitiveValues", () => {
  it("removes a secret from nested strings and keys", () => {
    const value = {
      visibleText: `Your password is ${SECRET}.`,
      elements: [{ name: SECRET }, { name: "Sign in" }],
      [SECRET]: 1,
    };
    const redacted = redactSensitiveValues(value, [SECRET]);
    expect(JSON.stringify(redacted)).not.toContain(SECRET);
    expect(redacted.visibleText).toBe(`Your password is ${REDACTED_VALUE}.`);
    expect(redacted.elements[1]!.name).toBe("Sign in");
  });

  it("removes URI-encoded and JSON-escaped forms", () => {
    const quoted = 'pa"ss\\word';
    const redacted = redactSensitiveValues(
      {
        body: `user=nick&password=${encodeURIComponent(SECRET)}`,
        json: JSON.stringify({ password: quoted }),
      },
      [SECRET, quoted],
    );
    expect(redacted.body).toBe(`user=nick&password=${REDACTED_VALUE}`);
    expect(redacted.json).not.toContain("ss\\\\word");
    expect(redacted.json).toContain(REDACTED_VALUE);
  });

  it("only redacts exact matches of very short values", () => {
    const redacted = redactSensitiveValues({ a: "abc", b: "abcdef" }, ["abc"]);
    expect(redacted).toEqual({ a: REDACTED_VALUE, b: "abcdef" });
  });

  it("returns the value untouched without secrets", () => {
    const value = { a: "text", n: 1, nested: [true, null] };
    expect(redactSensitiveValues(value, [])).toBe(value);
    expect(redactSensitiveValues(value, [""])).toBe(value);
  });

  it("redacts a bare string result", () => {
    expect(redactSensitiveValues(SECRET, [SECRET])).toBe(REDACTED_VALUE);
    expect(redactSensitiveValues(42, [SECRET])).toBe(42);
  });
});
