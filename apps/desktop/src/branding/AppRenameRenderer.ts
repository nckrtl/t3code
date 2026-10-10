// @effect-diagnostics globalDate:off -- Runs once at startup, outside any Effect service.
import {
  READ_LOCAL_STORAGE_SCRIPT,
  readMigrationMarker,
  shapeLocalStorageEntries,
  writeLocalStorageScript,
  writeMigrationMarker,
  type MigrationMarker,
} from "./AppRenameUserData.ts";

/** A page the migration can load and run a script in. */
export interface MigrationPage {
  readonly navigate: (url: string) => Promise<void>;
  readonly evaluate: (script: string) => Promise<unknown>;
  readonly close: () => void;
}

export type RendererStorageMigrationResult =
  | { readonly status: "skipped" }
  | { readonly status: "migrated"; readonly entries: number }
  | { readonly status: "failed"; readonly cause: unknown };

/**
 * localStorage belongs to an origin, and a renamed app has a new link scheme and
 * so a new origin. The copied user-data folder still holds the old origin's
 * localStorage, so a page at the old origin reads it and a page at the new origin
 * writes it. The marker says it is done, so this happens once; a failure leaves the
 * marker alone and the next launch tries again.
 */
export async function migrateRendererStorage(input: {
  readonly userDataPath: string;
  readonly previousOrigin: string;
  readonly newOrigin: string;
  readonly page: MigrationPage;
  readonly flush: () => Promise<void>;
  readonly now?: () => Date;
}): Promise<RendererStorageMigrationResult> {
  const marker = readMigrationMarker(input.userDataPath);
  if (marker === null || marker.status !== "copied") return { status: "skipped" };

  try {
    await input.page.navigate(`${input.previousOrigin}/`);
    const entries = shapeLocalStorageEntries(await input.page.evaluate(READ_LOCAL_STORAGE_SCRIPT));
    await input.page.navigate(`${input.newOrigin}/`);
    await input.page.evaluate(writeLocalStorageScript(entries));
    await input.flush();
    const entryCount = Object.keys(entries).length;
    const done: MigrationMarker = {
      ...marker,
      status: "complete",
      completedAt: (input.now ?? (() => new Date()))().toISOString(),
      localStorageEntries: entryCount,
    };
    writeMigrationMarker(input.userDataPath, done);
    return { status: "migrated", entries: entryCount };
  } catch (cause) {
    return { status: "failed", cause };
  } finally {
    input.page.close();
  }
}
