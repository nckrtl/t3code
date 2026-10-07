# Build and install the nckrtl desktop app

`nckrtl` is the fork's one customizations branch (it replaced the
`rooms-patches-*` branches). It lives on GitHub at `nckrtl/t3code` and is
checked out on both machines: this MacBook (`~/apps/t3code`) and the mini
(worktree `/Volumes/Data/nckrtl/.cache/t3-patches-045`). Both track
`origin/nckrtl`. Rebase it on `upstream/main` to take upstream changes, then
run the sync procedure in [SKILL.md](../SKILL.md).

## What the fork's build already does

- No update feed: every build sets `publish: null`, so the app never replaces
  itself with an upstream release (`scripts/build-desktop-artifact.ts`).
- The dev annotator is dev-only: `@nckrtl/annotator` is a dev dependency and
  `apps/web/vite/annotator.ts` applies only to `vite serve`. The production
  bundle must not contain `__annotator/inject`. The browser panel's own
  "Annotate preview" feature (`apps/web/src/annotations/`) is product code: it
  loads the overlay into the previewed page from an annotation server the user
  configures, and it does ship.

## Build on the mini

The mini holds the local signing identity ("Nick Local Code Signing").

```bash
ssh mini
cd /Volumes/Data/nckrtl/.cache/t3-patches-045
git pull --ff-only
vp i
node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 \
  --build-version 0.0.<upstream patch>-nckrtl.<YYYYMMDD>
```

Version: the upstream desktop version it is based on, then `-nckrtl.` and the
build date (earlier builds used `-rooms.`). Artifacts land in `release/`.

## Check the annotator is not bundled

```bash
grep -rl "__annotator/inject" apps/web/dist apps/server/dist   # must print nothing
```

## Sign and install

The `--signed` flag needs T3's Apple team, so re-sign with the local identity
(`scripts/sign-macos-local.ts`, hardened runtime, release entitlements minus
the team-bound passkey ones, so passkey sign-in is unavailable):

Over SSH the login keychain is locked and `codesign` fails with
`errSecInternalComponent`. Sign from a terminal on the mini itself, or unlock
the keychain in the SSH session first (the user types the password):

```bash
security unlock-keychain ~/Library/Keychains/login.keychain-db
```

```bash
tmp=$(mktemp -d)
ditto -x -k "release/T3-Code-<version>-arm64.zip" "$tmp"
node scripts/sign-macos-local.ts "$tmp/T3 Code (Alpha).app" "Nick Local Code Signing"
ditto -c -k --keepParent "$tmp/T3 Code (Alpha).app" "release/T3-Code-<version>-arm64-signed.zip"
```

Copy the signed zip to the target Mac, quit T3 Code, replace
`/Applications/T3 Code (Alpha).app`, and open it. User data in `~/.t3` is
untouched.
