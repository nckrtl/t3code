import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

/**
 * A bordered cluster of icon buttons in a panel toolbar (browser chrome, Files). Same height and
 * radius as the soft search field beside it; buttons inside get a concentric hover shape.
 */
export function ToolbarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-0.5 rounded-lg empty:hidden border border-(--toolbar-group-border)! bg-(--toolbar-group-fill) px-0.75 [--control-radius:6px]",
        className,
      )}
      {...props}
    />
  );
}
