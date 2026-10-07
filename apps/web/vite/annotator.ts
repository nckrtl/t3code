// @effect-diagnostics nodeBuiltinImport:off - Vite's dev plugin runs before an Effect runtime exists.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Plugin } from "vite-plus";

const SCRIPT_PATH = "/__annotator/inject.js";

/**
 * Dev-only: mounts the @nckrtl/annotator toolbar and points it at a local
 * annotation server (`npx @nckrtl/annotator serve --port 29703`), so browser
 * annotations collect in one store an agent can claim from. Speech uses Drift's
 * desktop dictation API, which records and types into the comment field; Drift
 * must allow this page's origin under Settings → Local API.
 * T3CODE_ANNOTATOR=0 turns it off; T3CODE_ANNOTATOR_URL overrides the server;
 * T3CODE_ANNOTATOR_DICTATION_URL overrides the Drift origin.
 */
export function annotatorPlugin(): Plugin {
  const serviceUrl = process.env.T3CODE_ANNOTATOR_URL ?? "http://127.0.0.1:29703/annotations";
  const dictationOrigin = process.env.T3CODE_ANNOTATOR_DICTATION_URL ?? "http://127.0.0.1:12322";
  const options = {
    dictation: {
      provider: "post",
      postUrl: `${dictationOrigin}/dictate`,
      stopUrl: `${dictationOrigin}/dictate-stop`,
    },
  };
  return {
    name: "t3code:annotator",
    apply: "serve",
    configureServer(server) {
      if (process.env.T3CODE_ANNOTATOR === "0") return;
      // Read through the package's node_modules link on every request, so an
      // upgrade is served without restarting (Node caches require.resolve
      // results for the life of the process).
      const scriptFile = join(server.config.root, "node_modules/@nckrtl/annotator/dist/inject.js");
      server.middlewares.use(SCRIPT_PATH, (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        response.end(readFileSync(scriptFile));
      });
    },
    transformIndexHtml() {
      if (process.env.T3CODE_ANNOTATOR === "0") return;
      // The toolbar reads its delivery settings from this tab's sessionStorage.
      // Seed the local server once; a URL saved in the toolbar settings wins.
      const setup = [
        `window.__AGENT_ANNOTATION__=${JSON.stringify(options)};`,
        `try{sessionStorage.getItem("annotate:service")||sessionStorage.setItem("annotate:service",${JSON.stringify(
          JSON.stringify({ mode: "server", serviceUrl }),
        )})}catch{}`,
      ].join("");
      return [
        { tag: "script", children: setup, injectTo: "head" },
        { tag: "script", attrs: { src: SCRIPT_PATH, defer: true }, injectTo: "body" },
      ];
    },
  };
}
