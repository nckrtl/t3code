---
name: nckrtl-shell-design
description: The nckrtl fork's shell design system for T3 Code (ChatGPT-desktop structure, active-theme palette, shell tokens). Use for UI polish on the `nckrtl` branch, when you style a new or changed web component, after you merge upstream T3 Code into `nckrtl`, and when you review upstream components for consistency with the fork's look.
---

# nckrtl shell design

The `nckrtl` branch restyles T3 Code's web shell. The structure follows the
ChatGPT desktop app. The colors come from the active theme. This skill records
the user's feedback so you can apply the same style and keep it alive across
upstream merges.

Sources: the fork's `style(web)` commits after the upstream merge-base
(`git merge-base nckrtl upstream/main`), annotation records in
`~/.t3/dev/annotations/done`, and the user's own chat direction. The full token
table is in [references/tokens.md](references/tokens.md).

## When to use

- A UI polish pass on `nckrtl`, from annotations or chat feedback.
- New or changed web UI on `nckrtl`, including fork-only panels (annotator,
  Laravel toolbar, Orbit, device).
- After a merge of upstream T3 Code into `nckrtl`. Run the sync procedure below.
- A review of new upstream components for consistency with the fork.

## Principles

1. **Structure from ChatGPT, palette from the theme.** Copy layering, opacity,
   blur, spacing and radii from ChatGPT desktop. Do not copy its colors. The
   user's theme is "Dark Ocean" (`~/.t3/dev/themes/dark-ocean.json`). Every
   built-in and custom theme must keep its own palette.
2. **Never change the icon family or the fonts.** They are user settings. Keep
   lucide icons and the configured sans and mono fonts.
3. **Tokens over colors.** Use a shell token or a theme role. Shell tokens are
   `color-mix` values of `--sidebar`, `--background`, `--foreground` and other
   theme roles. Do not write literal colors or opacity tweaks such as
   `bg-white/10`.
4. **Variants over restyles.** If a `components/ui` primitive needs a new look,
   add a variant (`InputGroup` `soft`, `Kbd` `raised`, `SidebarMenuButton`
   `row`, `ComposerControl` `appearance="field"`). Do not restyle with
   `className`.
5. **Same feedback, every surface.** The user expects a fix in one place to
   apply everywhere: chat, sidebar, Settings, browser, Files, Diff, file
   preview, terminal, Agents, device, annotator and Laravel toolbar panels.
   Search for siblings before you call a change done. The user called out
   misses ("You missed these", "Please double check your work").
6. **Fix it in the shared component.** If two controls should match, change
   the one component or token they share. The user expects one edit, not
   per-panel overrides.
7. **Experiments are reversible through one token.** When the user says "I
   want to see", put the change behind one token or one commit, and say how
   to revert it (example: `--switch-radius`).

## Rules by area

### Shell and window

- Window corner is `--window-radius` (16px). Inset cards sit `--shell-inset`
  (2px) from the window edge.
- Corners are concentric: inner radius = outer radius - inset. Outer bottom
  corners of cards use `rounded-br-(--shell-corner)`. Rail tiles use
  `rounded-tile` inside the 10px rail button. Hover shapes must follow the
  shell curve (the Settings Back button got extra bottom padding for this).
- Headers are 44px (`--shell-header-height`) and transparent over the frosted
  frame. Center header controls on that height.
- Chat, right panel and Settings content are cards on `bg-(--shell-card)` that
  re-root `[--background:var(--shell-card)]` and
  `[--terminal-background:var(--shell-card)]`, so the content inside follows.
- Page containers inside the window use `h-full`, never `h-dvh` (`h-dvh`
  overflowed the window and clipped the inset).
- The shell containers use `backdrop-blur`, which makes them stacking contexts.
  The browser page is a fixed webview layer (z 30) mounted at the app root, so
  any overlay that must sit above the page (flyouts, sheets) portals to `body`
  with `fixed` positioning. A `z-*` inside the shell cannot rise above it (#122:
  the Laravel toolbar flyout went hidden).
- Floating surfaces (menus, selects, popovers, tooltips, toasts, annotation
  panels) use `dropdown-glass` with `rounded-xl` and `rounded-lg` rows. The
  user wants mostly opaque fills with heavy blur, so content behind stays calm.

### Surfaces

- Hover and selection pills use `--shell-highlight`, never `currentColor`
  mixes or a dark muted fill.
- Settings groups and the selected item in a list use `--shell-highlight`
  (lighter than siblings). Hover is a fainter version.
- A fill must not stack on a parent fill of the same kind. A group inside a
  settings card has no fill of its own.
- Empty-state icon tiles use `--shell-tile` (lighter than the card) with a
  `--shell-tile-border` border, not `bg-card`.
- Soft fields use `--shell-field`. `ToolbarGroup` uses `--shell-control`,
  slightly darker than the field.
- Selected rail workspace: `ring-2 ring-inset ring-sidebar-foreground/90`, tile
  shrunk to leave a visible gap inside the ring.

### Borders and dividers

- Two tones: `--shell-divider-header` on the header and frame,
  `--shell-divider` in the cards. Full-height side dividers use
  `shell-divider-r` and `shell-divider-l`.
- Inside a raised card (settings groups, keybinding rows), row dividers use
  `--shell-divider-raised`. Inside `dropdown-glass`, use `--glass-divider`.
- Plain `border-(--x)` loses to the global border rules (`* { border-border }`
  and theme border colors). Write `border-(--x)!` or `divide-(--x)!`.
  `border-image` utilities win without `!`.
- Panel splits: one continuous line under the toolbar across both columns,
  plus the vertical divider, meeting in a clean T (Files preview, Diff). No
  double lines: drop the toolbar's own bottom border when the split line
  exists.
- List rows (Agents, keybindings, settings) get a divider between rows, not
  after the last one.

### Typography

- `text-ui` (13px) is the panel and settings size: titles, descriptions,
  status lines, control text, tree items, agent rows, notices. Do not use
  `text-xs` or `text-2xs` for secondary text in panel chrome.
- Secondary text matches the title size and stays muted.
- Right-panel tab labels and the breadcrumb use `text-sm`; tab and header icons
  are `size-4`.
- Use sans everywhere except code and terminal output. Versions (`v0.160.1`,
  `git version 2.54.0`), `When` values and agent metadata are sans, with
  `tabular-nums` where numbers line up.
- Headings are normal case, foreground color. No uppercase section labels.
- Diff counts match the size of the text beside them.

### Controls

- Switches are pills (`--switch-radius: 9999px`). The checked track is
  `--switch-on` on every switch, including menu switch items.
- Button and toggle corners come from `--control-radius`, set once on the
  container: 9999px in the chat and Settings headers, 6px in the right panel
  and inside `ToolbarGroup`. Toggles and toggle groups follow it too.
- Search and address fields use `InputGroup variant="soft"`: `rounded-lg`, a
  `--shell-divider-header` border, a leading lucide search icon, 13px text, and
  an icon inset equal to the vertical inset.
- `ToolbarGroup` (`components/ToolbarGroup.tsx`) wraps related icon buttons:
  h-8, `rounded-lg`, same height and radius as the soft field. Group only
  tools that belong together (navigation; page actions). Do not give each
  action its own box, and do not put every action in one group.
- Gap between toolbar groups is 8px (`gap-2`).
- Header and action buttons that look like buttons use `variant="outline"`
  with a visible border. Icon-to-label gap is 6px.
- Key caps use `Kbd variant="raised"`: `--shell-highlight` fill, light text.
- Settings pickers use `ComposerControl appearance="field"` so they match the
  `Select` trigger.

### Notices

- Notices sit in a 4px-inset rounded container with a tint: `bg-warning/10`
  with `text-warning` for warnings, `bg-info/10` with `text-info-foreground`
  for info. Info uses blue because it is information, not a warning.
- Center the icon and the text on one line (`items-center`, no icon offset).
- Add a row divider below the notice when it sits in a divided group.

### Scrollbars

- Scroll areas in cards use `scrollbar-gutter-both scrollbar-inset`: a fully
  rounded thumb 5px from the side, top and bottom edges, so it follows the
  card corner. Settings and the chat timeline use it.
- `.scrollbar-inset` is plain unlayered CSS on purpose. A Tailwind utility
  loses to the global `::-webkit-scrollbar` rules.

### Settings

- Settings uses the same shell as the chat: inset nav like the thread panel,
  content card under a 44px glass header, thread-row hover colors.
- Rows inside a group are square (`rounded-none`), with
  `--shell-divider-raised` dividers. No double divider at the bottom.
- Trailing controls (switches, selects) align with the title line, not the
  row middle.
- Groups re-root `--muted-foreground` to `--muted-foreground-raised` so
  secondary text stays readable on the raised fill.
- The scope sentence matches the header breadcrumb size (`text-sm`).

### Spacing and alignment

- Panel toolbar rows use `py-toolbar` (7.5px) and `pe-toolbar-end` (11.5px),
  so the last button's side gap equals its top gap.
- Content aligns with the tab row: the first letter or icon starts at 16px,
  where the first tab icon starts. Tree icons align with the search icon.
- The terminal's first line centers on the action group and starts with the
  first tab (`ps-4 pt-4`).
- Bottom padding matches top padding. Side inset matches top inset.
- Tree rows are 28px. Tree carets are 12px and use `--muted-foreground` in
  Files and Diff.
- The user's chat bubble uses `rounded-bubble` (16px).

## Rejected or reverted

Do not reintroduce these:

- Rounded-square switches (`--switch-radius: 6px`). Reverted to pills.
- A separate bordered box per browser action (`d0d43e2b40`, reverted).
- A fully rounded (pill) address bar or Files search. Replaced by the
  `rounded-lg` soft field.
- A fully rounded navigation group. It now matches the field shape.
- Inverted key caps (light fill, dark text). Replaced by `raised`.
- ChatGPT's own colors. Keep the theme palette.
- Cards made "too dark", and headings darker than the header.
- Thin dividers in `border-border/60` (too light) where shell dividers belong.
- Agent duration and metadata at 11px or in mono. They are `text-ui` sans.

## Upstream sync procedure

1. Merge upstream. Resolve conflicts with the fork's style. These files and
   tokens are fork-owned; keep the fork's side and re-apply upstream logic
   around it:
   - `apps/web/src/index.css`: `@theme inline` additions (`--text-ui`,
     `--radius-tile`, `--radius-bubble`, `--spacing-toolbar*`),
     `dropdown-glass`, `--glass-divider`, `.scrollbar-inset`, the shell token
     block at the end, `shell-divider-r|l`, mock window classes.
   - `lib/utils.ts` tailwind-merge registration of `text-ui`.
   - `components/ToolbarGroup.tsx`, `ui/input-group.tsx` (`soft`),
     `ui/kbd.tsx` (`raised`), `ui/switch.tsx`, `ui/menu.tsx`,
     `ui/toggle.tsx`, `ui/toggle-group.tsx`, `ui/sidebar.tsx` (`row`,
     dividers), `ui/empty.tsx`, `chat/ComposerControl.tsx` (`field`).
   - `settings/SettingsGroup.tsx`, `settings/settingsLayout.tsx`,
     `routes/settings.tsx`, `ChatView.tsx` header and card,
     `RightPanelTabs.tsx`, `routes/__root.tsx` (mock window).
2. Scan new and changed upstream UI for regressions:

   ```bash
   B=$(git merge-base nckrtl upstream/main)
   git diff "$B"..nckrtl --stat -- apps/web/src   # fork surface
   git diff ORIG_HEAD..HEAD -- apps/web/src | grep -nE \
     'border-border/[0-9]+|h-dvh|bg-card\b|text-(xs|2xs)\b|font-mono|rounded-md|uppercase|bg-(white|black)/|rounded-full'
   ```

   Review each hit. Typical fixes: `border-border/60` to `border-(--shell-divider)!`;
   `h-dvh` page frame to `h-full`; `bg-card` tile to `--shell-tile`;
   `text-xs` panel text to `text-ui`; mono version text to sans; ungrouped
   toolbar icon buttons to `ToolbarGroup`; `rounded-md` hover rows to the
   container's radius or `--control-radius`; new popups to `dropdown-glass`.

3. Check that new scroll containers in cards use `scrollbar-inset`, and new
   switches use the primitive (no own track color).
4. Lint the touched files (`vp lint <files>`) and typecheck `apps/web`
   (`tsc --noEmit`). Do not run repo-wide checks.
5. Visual check, when the user agrees: use the `test-t3-app` skill. Check
   Dark Ocean and at least one built-in light theme. Look at the chat,
   sidebar, Settings, browser, Files, Diff and terminal.

## Lint constraints

These rules fail lint and shape how styles are written:

- `shadcn/no-restyle`: no typography, spacing, color or radius classes on
  `components/ui` exports outside `components/ui`. Layout classes are allowed.
  Add a variant instead.
- `shadcn/no-arbitrary-values`: no `text-[13px]` or `p-[7.5px]`. Add a scale
  token (`--text-ui`, `--spacing-toolbar`) instead.
- `shadcn/require-static-classes`: no runtime-built `className` on ui
  components.
- `shadcn/no-raw-colors`: colors come from theme tokens.
- `no-restricted-imports`: do not import ui internals such as
  `selectTriggerVariants`. Render the exported component instead
  (`SelectButton`).
- Tailwind v4 uses `@theme inline`, so `rounded-lg` compiles to
  `var(--radius)`. To change a scope's radius, override `--radius`, not
  `--radius-lg`.
- Unlayered global CSS beats Tailwind utilities. Put overrides of global rules
  in plain CSS after them.
