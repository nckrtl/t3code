// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Writes a migration marker in a temp directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { migrateRendererStorage, type MigrationPage } from "./AppRenameRenderer.ts";
import { readMigrationMarker, writeMigrationMarker } from "./AppRenameUserData.ts";

let userData: string;

beforeEach(() => {
  userData = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "conn-renderer-"));
});

afterEach(() => {
  NodeFS.rmSync(userData, { recursive: true, force: true });
});

/** Two origins with their own localStorage, and a page that is at one of them at a time. */
function makeBrowser(initial: Record<string, Record<string, string>>) {
  const storages = new Map(
    Object.entries(initial).map(([origin, entries]) => [origin, new Map(Object.entries(entries))]),
  );
  const log: string[] = [];
  let current = "";
  const page: MigrationPage = {
    navigate: async (url) => {
      const { protocol, host } = new URL(url);
      current = `${protocol}//${host}`;
      log.push(`navigate ${current}`);
    },
    evaluate: async (script) => {
      const storage = storages.get(current) ?? new Map<string, string>();
      storages.set(current, storage);
      const localStorage = {
        get length() {
          return storage.size;
        },
        key: (index: number) => [...storage.keys()][index] ?? null,
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
      };
      log.push(`script at ${current}`);
      return new Function("localStorage", `return ${script}`)(localStorage);
    },
    close: () => void log.push("close"),
  };
  return { page, storages, log };
}

const markCopied = () =>
  writeMigrationMarker(userData, {
    version: 1,
    status: "copied",
    from: "/old/t3code-dev",
    copiedAt: "2026-10-10T10:00:00.000Z",
  });

const origins = { previousOrigin: "t3code-dev://app", newOrigin: "conn-dev://app" };

describe("migrateRendererStorage", () => {
  it("copies every localStorage entry of the old origin to the new one and marks it done", async () => {
    markCopied();
    const browser = makeBrowser({
      "t3code-dev://app": {
        "t3code:environment-provider:v1": '"orbit"',
        "t3code:orbit-environments:v1": '{"switched":["a"]}',
        "t3code:workspaces": '[{"id":"w1"}]',
        "t3code:theme": "dark",
      },
    });
    let flushed = 0;

    const result = await migrateRendererStorage({
      userDataPath: userData,
      ...origins,
      page: browser.page,
      flush: async () => void (flushed += 1),
      now: () => new Date("2026-10-10T10:00:05.000Z"),
    });

    expect(result).toEqual({ status: "migrated", entries: 4 });
    expect(Object.fromEntries(browser.storages.get("conn-dev://app")!)).toEqual(
      Object.fromEntries(browser.storages.get("t3code-dev://app")!),
    );
    expect(flushed).toBe(1);
    expect(browser.log.at(-1)).toBe("close");
    expect(readMigrationMarker(userData)).toMatchObject({
      status: "complete",
      completedAt: "2026-10-10T10:00:05.000Z",
      localStorageEntries: 4,
    });
  });

  it("runs once: a finished or missing marker skips it", async () => {
    const browser = makeBrowser({ "t3code-dev://app": { key: "value" } });

    expect(
      await migrateRendererStorage({
        userDataPath: userData,
        ...origins,
        page: browser.page,
        flush: async () => undefined,
      }),
    ).toEqual({ status: "skipped" });

    markCopied();
    await migrateRendererStorage({
      userDataPath: userData,
      ...origins,
      page: browser.page,
      flush: async () => undefined,
    });
    browser.log.length = 0;
    browser.storages.get("t3code-dev://app")!.set("added later", "x");

    const again = await migrateRendererStorage({
      userDataPath: userData,
      ...origins,
      page: browser.page,
      flush: async () => undefined,
    });

    expect(again).toEqual({ status: "skipped" });
    expect(browser.log).toEqual([]);
    expect(browser.storages.get("conn-dev://app")!.has("added later")).toBe(false);
  });

  it("keeps what the new origin already has", async () => {
    markCopied();
    const browser = makeBrowser({
      "t3code-dev://app": { theme: "old theme", workspaces: "old" },
      "conn-dev://app": { theme: "new theme" },
    });

    await migrateRendererStorage({
      userDataPath: userData,
      ...origins,
      page: browser.page,
      flush: async () => undefined,
    });

    expect(Object.fromEntries(browser.storages.get("conn-dev://app")!)).toEqual({
      theme: "new theme",
      workspaces: "old",
    });
  });

  it("still completes for an old origin with nothing stored", async () => {
    markCopied();
    const browser = makeBrowser({});

    const result = await migrateRendererStorage({
      userDataPath: userData,
      ...origins,
      page: browser.page,
      flush: async () => undefined,
    });

    expect(result).toEqual({ status: "migrated", entries: 0 });
    expect(readMigrationMarker(userData)?.status).toBe("complete");
  });

  it("leaves the marker alone when a step fails, so the next launch tries again", async () => {
    markCopied();
    const browser = makeBrowser({ "t3code-dev://app": { key: "value" } });
    const failing: MigrationPage = {
      ...browser.page,
      evaluate: async (script) => {
        if (script.includes("setItem")) throw new Error("the page crashed");
        return browser.page.evaluate(script);
      },
    };

    const result = await migrateRendererStorage({
      userDataPath: userData,
      ...origins,
      page: failing,
      flush: async () => undefined,
    });

    expect(result.status).toBe("failed");
    expect(readMigrationMarker(userData)?.status).toBe("copied");
    expect(browser.log.at(-1)).toBe("close");
  });
});
