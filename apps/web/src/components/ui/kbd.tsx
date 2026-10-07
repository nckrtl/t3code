import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";

const kbdVariants = cva(
  "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded px-1 font-medium font-sans text-xs [&_svg:not([class*='size-'])]:size-3",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        // Light cap, dark glyph: the theme's foreground as the fill, the background as the glyph.
        inverted: "bg-foreground/90 text-background",
      },
    },
  },
);

function Kbd({
  className,
  variant,
  ...props
}: React.ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return <kbd className={cn(kbdVariants({ variant }), className)} data-slot="kbd" {...props} />;
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
