// @effect-diagnostics globalDate:off globalTimers:off -- Runs once, before the Effect runtime serves a window; plain promises keep it independent of it.
import * as Effect from "effect/Effect";
import * as Electron from "electron";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import { appBrand, appBrandPreviousScheme, appBrandScheme, type AppBrand } from "./appBrand.ts";
import {
  legacyKeychainServices,
  readKeychainPassword,
  reencryptLegacySecrets,
} from "./AppRenameSecrets.ts";
import {
  migrateRendererStorage,
  type MigrationPage,
  type RendererStorageMigrationResult,
} from "./AppRenameRenderer.ts";
import { readMigrationMarker, writeMigrationMarker } from "./AppRenameUserData.ts";

const { logInfo, logWarning } = makeComponentLogger("app-rename");

const STEP_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out.`)), STEP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const blankPage = () =>
  new Response("<!doctype html><title></title>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

/**
 * A web contents with no window, so closing it never fires `window-all-closed`
 * (which quits the app on Windows and Linux before the main window exists).
 */
function makeElectronMigrationPage(): MigrationPage {
  const view = new Electron.WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const contents = view.webContents;
  return {
    navigate: (url) => withTimeout(contents.loadURL(url), `Loading ${url}`),
    evaluate: (script) => withTimeout(contents.executeJavaScript(script), "Running a script"),
    close: () => {
      if (!contents.isDestroyed()) contents.close();
    },
  };
}

async function runRendererStorageMigration(input: {
  readonly brand: AppBrand;
  readonly isDevelopment: boolean;
  readonly userDataPath: string;
}): Promise<RendererStorageMigrationResult> {
  const previousScheme = appBrandPreviousScheme(input.brand, input.isDevelopment);
  if (previousScheme === null) return { status: "skipped" };
  const scheme = appBrandScheme(input.brand, input.isDevelopment);

  // Both origins serve a blank page just for this. The real handler for the new
  // scheme is registered later in startup.
  try {
    Electron.protocol.handle(previousScheme, blankPage);
    Electron.protocol.handle(scheme, blankPage);
    return await migrateRendererStorage({
      userDataPath: input.userDataPath,
      previousOrigin: `${previousScheme}://app`,
      newOrigin: `${scheme}://app`,
      page: makeElectronMigrationPage(),
      flush: async () => {
        Electron.session.defaultSession.flushStorageData();
        // The request is handled in Chromium's storage service; give it a moment to reach the disk.
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });
  } catch (cause) {
    return { status: "failed", cause };
  } finally {
    for (const handled of [previousScheme, scheme]) {
      if (Electron.protocol.isProtocolHandled(handled)) Electron.protocol.unhandle(handled);
    }
  }
}

async function runSecretReencryption(input: {
  readonly isDevelopment: boolean;
  readonly stateDir: string;
}) {
  if (!Electron.safeStorage.isEncryptionAvailable()) return null;
  return reencryptLegacySecrets({
    stateDir: input.stateDir,
    decryptCurrent: (bytes) => Electron.safeStorage.decryptString(Buffer.from(bytes)),
    encryptCurrent: (plaintext) => Electron.safeStorage.encryptString(plaintext),
    legacyPasswords: async () => {
      const passwords: string[] = [];
      for (const service of legacyKeychainServices(input.isDevelopment)) {
        const password = await readKeychainPassword(service);
        if (password !== null) passwords.push(password);
      }
      return passwords;
    },
  });
}

/**
 * Runs once Electron is ready and before any window opens. It only does anything
 * for a renamed app whose old user-data folder was just copied.
 */
export const migrateRenamedApp = Effect.gen(function* () {
  if (appBrand.previous === null) return;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const userDataPath = Electron.app.getPath("userData");
  const marker = readMigrationMarker(userDataPath);
  if (marker === null) return;

  if (marker.status === "copied") {
    const result = yield* Effect.promise(() =>
      runRendererStorageMigration({
        brand: appBrand,
        isDevelopment: environment.isDevelopment,
        userDataPath,
      }),
    );
    if (result.status === "migrated") {
      yield* logInfo("copied localStorage to the renamed app's origin", {
        entries: result.entries,
      });
    } else if (result.status === "failed") {
      yield* logWarning("could not copy localStorage; the next launch will try again", {
        cause: result.cause,
      });
    }
  }

  // The secrets check runs once. A failure (for example a declined keychain prompt)
  // leaves it to run again on the next launch.
  const current = readMigrationMarker(userDataPath);
  if (current === null || current.secretsChecked === true) return;
  const secrets = yield* Effect.promise(() =>
    runSecretReencryption({
      isDevelopment: environment.isDevelopment,
      stateDir: environment.stateDir,
    }),
  ).pipe(
    Effect.catchCause((cause) =>
      logWarning("could not check saved secrets after the rename", { cause }).pipe(Effect.as(null)),
    ),
  );
  if (secrets === null) return;
  if (secrets.examined > 0)
    yield* logInfo("checked saved secrets after the rename", { ...secrets });
  if (secrets.failed === 0) {
    writeMigrationMarker(userDataPath, { ...current, secretsChecked: true });
  }
}).pipe(Effect.withSpan("desktop.appRename.migrate"));
