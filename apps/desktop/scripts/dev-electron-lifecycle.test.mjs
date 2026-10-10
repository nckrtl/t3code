import { assert, describe, it } from "vite-plus/test";

import {
  buildElectronLaunchArgs,
  isParentGone,
  parseDebugPort,
  waitForPortFree,
} from "./dev-electron-lifecycle.mjs";

describe("dev-electron launch arguments", () => {
  it("keeps the debug port on every launch, with and without the macOS protocol client", () => {
    const protocolClient = { appBundleId: "dev.test" };
    for (let launch = 0; launch < 3; launch += 1) {
      assert.deepEqual(
        buildElectronLaunchArgs({
          remoteDebuggingPort: "9222",
          devProtocolClient: protocolClient,
          desktopDir: "/repo/apps/desktop",
        }),
        ["--remote-debugging-port=9222"],
      );
      assert.deepEqual(
        buildElectronLaunchArgs({
          remoteDebuggingPort: "9222",
          devProtocolClient: null,
          desktopDir: "/repo/apps/desktop",
        }),
        [
          "--remote-debugging-port=9222",
          "--t3code-dev-root=/repo/apps/desktop",
          "dist-electron/main.cjs",
        ],
      );
    }
  });

  it("adds no debug flag when the port is unset", () => {
    assert.deepEqual(
      buildElectronLaunchArgs({
        remoteDebuggingPort: undefined,
        devProtocolClient: { appBundleId: "dev.test" },
        desktopDir: "/repo/apps/desktop",
      }),
      [],
    );
  });

  it("only waits for a real port number", () => {
    assert.equal(parseDebugPort("9222"), 9222);
    for (const value of [undefined, "", "abc", "0", "-1", "70000"]) {
      assert.equal(parseDebugPort(value), null);
    }
  });
});

describe("waitForPortFree", () => {
  function makeClock() {
    let time = 0;
    return {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    };
  }

  it("waits for the previous Electron to release the port", async () => {
    const clock = makeClock();
    const checks = [];
    const free = await waitForPortFree({
      port: 9222,
      ...clock,
      isPortFree: async ({ host, port }) => {
        checks.push(`${host}:${port}`);
        return checks.length >= 4;
      },
    });
    assert.equal(free, true);
    assert.equal(checks.length, 4);
    assert.equal(clock.now(), 300);
  });

  it("returns at once when the port is already free", async () => {
    const clock = makeClock();
    const free = await waitForPortFree({ port: 9222, ...clock, isPortFree: async () => true });
    assert.equal(free, true);
    assert.equal(clock.now(), 0);
  });

  it("gives up after the timeout so a stuck port cannot block the launch", async () => {
    const clock = makeClock();
    const free = await waitForPortFree({
      port: 9222,
      timeoutMs: 1_000,
      ...clock,
      isPortFree: async () => false,
    });
    assert.equal(free, false);
    assert.equal(clock.now(), 1_000);
  });
});

describe("isParentGone", () => {
  it("is false while the original parent is alive", () => {
    assert.equal(isParentGone(4321, 4321), false);
  });

  it("is true once the script is re-parented, including to init", () => {
    assert.equal(isParentGone(4321, 1), true);
    assert.equal(isParentGone(4321, 999), true);
  });
});
