import {
  BookOpenIcon,
  BriefcaseIcon,
  BuildingIcon,
  CodeIcon,
  CoffeeIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  type LucideIcon,
  PaletteIcon,
  RocketIcon,
  ServerIcon,
  StarIcon,
  TerminalIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { workspaceLetter, type Workspace, type WorkspaceColor } from "../../workspaces.logic";

/** Icons a workspace can show in place of its letter. */
export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  briefcase: BriefcaseIcon,
  code: CodeIcon,
  terminal: TerminalIcon,
  rocket: RocketIcon,
  server: ServerIcon,
  globe: GlobeIcon,
  folder: FolderIcon,
  book: BookOpenIcon,
  flask: FlaskConicalIcon,
  palette: PaletteIcon,
  users: UsersIcon,
  building: BuildingIcon,
  house: HouseIcon,
  star: StarIcon,
  heart: HeartIcon,
  zap: ZapIcon,
  coffee: CoffeeIcon,
};

/** Literal class names, so Tailwind keeps them. */
export const WORKSPACE_COLOR_CLASSES: Record<WorkspaceColor, string> = {
  slate: "bg-slate-500 text-white",
  red: "bg-red-500 text-white",
  orange: "bg-orange-500 text-white",
  amber: "bg-amber-500 text-black",
  green: "bg-green-600 text-white",
  teal: "bg-teal-600 text-white",
  sky: "bg-sky-500 text-white",
  blue: "bg-blue-600 text-white",
  violet: "bg-violet-600 text-white",
  pink: "bg-pink-500 text-white",
};

/** A workspace's badge: its icon, or the first letter of its name, on its color. */
export function WorkspaceBadge({
  workspace,
  className,
}: {
  workspace: Pick<Workspace, "name" | "color" | "icon">;
  className?: string;
}) {
  const Icon = workspace.icon ? WORKSPACE_ICONS[workspace.icon] : undefined;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7.5 items-center justify-center rounded text-sm font-semibold select-none",
        WORKSPACE_COLOR_CLASSES[workspace.color],
        className,
      )}
    >
      {Icon ? <Icon className="size-4" /> : workspaceLetter(workspace.name)}
    </span>
  );
}
