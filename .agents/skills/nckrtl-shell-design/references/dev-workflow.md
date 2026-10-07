# Annotate the fork in desktop dev mode

The design rules in this skill came from a loop: the user clicks an element in
the running app, says what to change, and an agent picks the note up, fixes
it, and marks it done. Running that loop inside the **desktop** dev app (not
only the web dev server) is what made the integrated browser tweakable: the
browser panel's page, its chrome row and the Laravel toolbar only exist in
Electron, because the web build has no `desktopBridge.preview`.

The annotator is `@nckrtl/annotator`, a dev dependency of `apps/web`. It is
independent of T3, Orbit and Commander.

## 1. Start the annotation server

One local store that both the web and desktop dev apps post to:

```bash
cd ~/apps/t3code/apps/web
node node_modules/@nckrtl/annotator/bin/serve.mjs serve --port 29703 --store ~/.t3/dev/annotations
```

API on `http://127.0.0.1:29703/annotations`: `GET` lists records, `POST
/claim {id}`, `POST /complete {id, summary}`, `POST /release {id}`. Claim
before you complete: a complete on an unclaimed record does not stick.

## 2. Web dev server (shared components, measuring)

```bash
cd ~/apps/t3code && vp run dev     # web on 5733 against ~/.t3/dev
```

`apps/web/vite/annotator.ts` mounts the toolbar only under `vite serve`
(`apply: "serve"`). It serves `inject.js` from the package on each request, sets
dictation to Drift Dev's local API (`http://127.0.0.1:12322/dictate` and
`/dictate-stop`; Drift must allow the page origin under Settings → Local API),
and seeds the server URL in `sessionStorage` (`annotate:service`). Env:
`T3CODE_ANNOTATOR=0` turns it off, `T3CODE_ANNOTATOR_URL` and
`T3CODE_ANNOTATOR_DICTATION_URL` override the URLs.

The web view is where an agent can measure: the Browser pane tools run
JavaScript against it, so compare computed colors, radii and positions there
for anything the web and desktop share.

## 3. Desktop dev app with its own state

Two backends must never share one SQLite file, so the desktop dev app gets its
own home seeded from the web dev state:

```bash
D=~/.t3/desktop-dev/userdata; mkdir -p "$D"; rm -f "$D"/state.sqlite*
cd ~/apps/t3code
bun -e "new (require('bun:sqlite').Database)(process.env.HOME + '/.t3/dev/state.sqlite', { readonly: true }).run(\"VACUUM INTO '$D/state.sqlite'\")"
cp ~/.t3/dev/settings.json ~/.t3/dev/keybindings.json "$D"/ && cp -R ~/.t3/dev/themes "$D"/
vp run dev:desktop --home-dir ~/.t3/desktop-dev
```

Do not copy `environment-id`, `secrets` or `server-runtime.json`: the desktop
dev app keeps its own server identity. The runner picks shifted ports (web
5734, server 13774) and opens **T3 Code (Dev)**. It uses the same Vite config,
so the annotator appears inside the Electron window and posts to the same
store; its records show `t3code-dev://app/...` URLs.

## 4. Process the queue

- Watch `GET /annotations` for `status: "todo"` (a poll every few seconds;
  report "unreachable" only after a few failed polls, the store holds
  screenshots and can answer slowly).
- Per record: read `comment`, `element`, `elementPath`, `react` and
  `components` (the React component chain finds the file fast), claim it, fix
  it, lint the touched files, commit, then complete with a summary that names
  the commit.
- Apply each note to every sibling surface, not only the clicked one.
- Experiments go behind one token or one commit; tell the user how to revert.

## 5. Verify

- Web view: measure with JavaScript in the Browser pane.
- Desktop dev window: screen tools cannot target the dev Electron app, and its
  DOM is not reachable without remote debugging. Either restart it with
  `T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=<port>` and inspect over CDP, or treat
  the user's next annotation on the changed element as visual confirmation
  (its `appearance.classes` show what rendered).
- Web HMR context errors (`SettingsScopeProvider`, sidebar provider) need a
  full reload.

## Gotchas

- Changes under `apps/desktop/src` rebuild the main process and restart the
  dev window. A browser tab may then fail to restore (`ERR_FAILED (-2)`,
  `Invalid guestInstanceId`), which also hides the Laravel toolbar; reload the
  tab.
- Stop only processes you started, by PID.
- The annotator never ships: see [build.md](build.md) for the check.
