import { describe, expect, it } from "vite-plus/test";

import { parseTotpSetup, totpCode } from "./totp.ts";

// RFC 6238 appendix B: the ASCII secret "12345678901234567890", base32 encoded.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    const setup = { ...parseTotpSetup(RFC_SECRET)!, digits: 8 };
    expect(totpCode(setup, 59_000)).toBe("94287082");
    expect(totpCode(setup, 1_111_111_109_000)).toBe("07081804");
    expect(totpCode(setup, 2_000_000_000_000)).toBe("69279037");
  });

  it("reads otpauth URIs with their digits, period and algorithm", () => {
    const setup = parseTotpSetup(
      `otpauth://totp/MyApp:admin?secret=${RFC_SECRET}&digits=8&period=30&algorithm=SHA1`,
    );
    expect(setup).toMatchObject({ digits: 8, periodSeconds: 30, algorithm: "sha1" });
    expect(totpCode(setup!, 59_000)).toBe("94287082");
  });

  it("rejects text that is not a secret", () => {
    expect(parseTotpSetup("not a secret!")).toBeNull();
    expect(parseTotpSetup("otpauth://hotp/x?secret=GEZDGNBV")).toBeNull();
    expect(parseTotpSetup("")).toBeNull();
  });
});
