import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  originOf,
  readCurrentCredentialApproval,
  requestCredentialApproval,
  respondToCredentialApproval,
} from "./credentialApproval";

const request = {
  itemTitle: "GitHub",
  providerLabel: "1Password",
  origin: "https://github.com",
  field: "password" as const,
};

describe("credential approval queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows prompts one at a time and resolves each with the user's answer", async () => {
    const first = requestCredentialApproval(request, Date.now() + 60_000);
    const second = requestCredentialApproval({ ...request, field: "otp" }, Date.now() + 60_000);
    const current = readCurrentCredentialApproval()!;
    expect(current.field).toBe("password");
    respondToCredentialApproval(current.id, true);
    await expect(first).resolves.toBe(true);
    const next = readCurrentCredentialApproval()!;
    expect(next.field).toBe("otp");
    respondToCredentialApproval(next.id, false);
    await expect(second).resolves.toBe(false);
    expect(readCurrentCredentialApproval()).toBeNull();
  });

  it("denies a prompt nobody answers by its deadline", async () => {
    const pending = requestCredentialApproval(request, Date.now() + 5_000);
    vi.advanceTimersByTime(5_000);
    await expect(pending).resolves.toBe(false);
    expect(readCurrentCredentialApproval()).toBeNull();
  });
});

describe("originOf", () => {
  it("returns only web origins", () => {
    expect(originOf("https://github.com/login?x=1")).toBe("https://github.com");
    expect(originOf("about:blank")).toBeNull();
    expect(originOf(null)).toBeNull();
  });
});
