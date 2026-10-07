import type { CSSProperties } from "react";

/** Shadow-root overrides that make a Pierre file tree read as part of the app chrome. */
export const PIERRE_TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, var(--foreground) 11%, transparent);
    --trees-hover-bg-override: var(--shell-highlight);
    --trees-fg-muted-override: var(--muted-foreground);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 13px;
  }
  button[data-type='item'] { border-radius: 5px; }
  :host { --trees-item-margin-x-override: 2px; --trees-item-padding-x-override: 8px; }
  /* Row backgrounds start 8px (6 padding + 2 margin) from the panel edge, like the search field; icons start 16px (+8 row padding), like its icon. */
  [data-file-tree-virtualized-scroll='true'][data-file-tree-virtualized-scroll='true'] { padding-inline: 6px; }
  [data-icon-name='file-tree-icon-chevron'] { width: 12px; height: 12px; }
`;

/** Host styles that keep a Pierre tree on the active color scheme and foreground. */
export function pierreTreeStyle(colorScheme: "light" | "dark"): CSSProperties {
  return {
    colorScheme,
    ["--trees-fg-override" as string]: "var(--contrast-foreground)",
  };
}
