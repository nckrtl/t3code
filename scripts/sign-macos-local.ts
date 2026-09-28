// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Standalone signing CLI without an Effect runtime.
// rooms-patches: re-sign a built T3 Code .app with a local code-signing
// identity, for installs that do not use T3's Developer ID. It applies the
// release build's entitlements and hardened runtime, minus the team-bound
// passkey entitlements, so passkey sign-in is unavailable in such a build.
//
// Usage: node scripts/sign-macos-local.ts "<T3 Code (Alpha).app>" [identity]
// The identity defaults to $LOCAL_SIGNING_IDENTITY.
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { sign } from "@electron/osx-sign";

const [appPath, identity = process.env.LOCAL_SIGNING_IDENTITY] = process.argv.slice(2);
if (!appPath || !identity) {
  throw new Error(
    'Usage: node scripts/sign-macos-local.ts "<App.app>" [identity]; set LOCAL_SIGNING_IDENTITY or pass the identity.',
  );
}

const entitlements = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "sign-macos-local.entitlements.plist",
);

await sign({
  app: appPath,
  identity,
  // A self-signed identity is valid only under the code-signing policy, which
  // osx-sign's own identity lookup does not use; codesign itself accepts it.
  identityValidation: false,
  platform: "darwin",
  type: "distribution",
  preAutoEntitlements: false,
  optionsForFile: () => ({ hardenedRuntime: true, entitlements }),
});
console.log(`Signed ${appPath} with "${identity}".`);
