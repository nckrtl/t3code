import { useAtomValue } from "@effect/atom-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChartNoAxesColumnIcon,
  CircleCheckIcon,
  DownloadIcon,
  GitPullRequestIcon,
  LayersIcon,
  PlusIcon,
  SettingsIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { canOpenDesktopWindows, openDesktopWorkspaceWindow } from "../../lib/desktopWindowContext";
import { cn } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { useEnvironments } from "../../state/environments";
import { primaryServerProvidersAtom } from "../../state/server";
import { useWorkspaceStore } from "../../workspaceStore";
import type { Workspace } from "../../workspaces.logic";
import { getProviderUpdateSidebarPillView } from "../ProviderUpdateLaunchNotification.logic";
import { useSidebar } from "../ui/sidebar";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { WorkspaceBadge } from "./workspaceVisuals";

function RailButton({
  label,
  hint,
  active = false,
  className,
  onClick,
  onEdit,
  onOpenWindow,
  children,
}: {
  label: string;
  /** A second tooltip line; workspaces default to how to edit them. */
  hint?: string;
  active?: boolean;
  className?: string;
  onClick: () => void;
  onEdit?: () => void;
  /** Opens this workspace in a new window: ⌘-click, or from the right-click menu. */
  onOpenWindow?: () => void;
  children: ReactNode;
}) {
  const showMenu = async (position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!onOpenWindow || !api) {
      onEdit?.();
      return;
    }
    const clicked = await api.contextMenu.show(
      [
        { id: "open-window", label: "Open in New Window" },
        ...(onEdit ? [{ id: "edit", label: "Edit…" }] : []),
      ],
      position,
    );
    if (clicked === "open-window") onOpenWindow();
    else if (clicked === "edit") onEdit?.();
  };
  const hasMenu = onEdit !== undefined || onOpenWindow !== undefined;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={(event) => {
              if (event.metaKey && onOpenWindow) onOpenWindow();
              else onClick();
            }}
            onDoubleClick={onEdit}
            onContextMenu={
              hasMenu
                ? (event) => {
                    event.preventDefault();
                    void showMenu({ x: event.clientX, y: event.clientY });
                  }
                : undefined
            }
            className={cn(
              // Tighter than the rail panel (rounded-lg); the badge inside is concentric (rounded, 4px in).
              "flex size-9.5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
              "outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-sidebar-row-active text-sidebar-foreground hover:bg-sidebar-row-active",
              className,
            )}
          >
            {children}
          </button>
        }
      />
      <TooltipPopup side="right">
        {label}
        {hint ? <span className="text-muted-foreground"> · {hint}</span> : null}
        {hasMenu && !hint ? (
          <span className="text-muted-foreground">
            {onOpenWindow ? " · ⌘-click for a new window" : " · right-click to edit"}
          </span>
        ) : null}
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * The workspace rail beside the thread sidebar: "All projects", one button per
 * workspace, and "New workspace". Selecting a workspace scopes the sidebar.
 * No divider: the rail is a slightly darker panel that starts below the title
 * bar, so the macOS window buttons sit on the plain sidebar.
 */
export function WorkspaceRail({ isElectron }: { isElectron: boolean }) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  // The dialog keeps its target while it animates closed; `session` remounts
  // its form each time it opens.
  const [dialog, setDialog] = useState<{
    target: Workspace | "new";
    open: boolean;
    session: number;
  }>({
    target: "new",
    open: false,
    session: 0,
  });
  const setEditing = (target: Workspace | "new") =>
    setDialog((current) => ({ target, open: true, session: current.session + 1 }));
  // Extra windows need the desktop shell (rooms-patches).
  const openWindow = canOpenDesktopWindows()
    ? (workspace: Workspace | null) => () => openDesktopWorkspaceWindow(workspace?.id ?? null)
    : null;

  return (
    <nav
      aria-label="Workspaces"
      data-workspace-rail=""
      className="flex h-full w-13.5 shrink-0 flex-col"
    >
      {/* Keeps clear of the macOS window buttons, and drags the window like the header. */}
      <div
        aria-hidden="true"
        className={cn(
          "h-[var(--workspace-topbar-height)] w-full shrink-0",
          isElectron && "drag-region",
        )}
      />
      <div className="flex min-h-0 w-full flex-1 flex-col rounded-tr-lg bg-black/[0.05] dark:bg-black/25">
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto pt-2 pb-2">
          <RailButton
            label="All projects"
            active={activeWorkspaceId === null}
            onClick={() => selectWorkspace(null)}
            {...(openWindow ? { onOpenWindow: openWindow(null) } : {})}
          >
            {/* Its own square, like a workspace badge, so the selected highlight rings it the same way. */}
            <span
              aria-hidden="true"
              className="flex size-7.5 items-center justify-center rounded bg-sidebar-foreground/10"
            >
              <LayersIcon className="size-4" />
            </span>
          </RailButton>
          {workspaces.map((workspace) => (
            <RailButton
              key={workspace.id}
              label={workspace.name}
              active={workspace.id === activeWorkspaceId}
              onClick={() => selectWorkspace(workspace.id)}
              onEdit={() => setEditing(workspace)}
              {...(openWindow ? { onOpenWindow: openWindow(workspace) } : {})}
            >
              <WorkspaceBadge workspace={workspace} />
            </RailButton>
          ))}
          <RailButton label="New workspace" onClick={() => setEditing("new")}>
            <PlusIcon className="size-4" />
          </RailButton>
        </div>
        <RailActions />
      </div>
      <WorkspaceDialog
        key={dialog.session}
        open={dialog.open}
        target={dialog.target}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
      />
    </nav>
  );
}

/**
 * The app's utility actions at the bottom of the rail, top to bottom: a provider
 * update (only while there is one, so it never shifts the rest), usage, pull
 * requests and settings. They replace the thread sidebar's footer row.
 */
function RailActions() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const page = useLocation({
    select: (location) =>
      location.pathname === "/usage"
        ? "usage"
        : location.pathname === "/pull-requests"
          ? "pull-requests"
          : null,
  });
  const { environments } = useEnvironments();
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const go = (to: () => void) => () => {
    if (isMobile) setOpenMobile(false);
    to();
  };

  return (
    // 9px below Settings levels it with the thread sidebar's Settled row above the footer.
    <div className="flex w-full shrink-0 flex-col items-center gap-2 pb-2.25">
      <RailProviderUpdate />
      <RailButton
        label="Usage"
        active={page === "usage"}
        onClick={go(() => void navigate({ to: "/usage" }))}
      >
        <ChartNoAxesColumnIcon className="size-4" />
      </RailButton>
      {pullRequestsSupported ? (
        <RailButton
          label="Pull Requests"
          active={page === "pull-requests"}
          onClick={go(
            () => void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() }),
          )}
        >
          <GitPullRequestIcon className="size-4" />
        </RailButton>
      ) : null}
      <RailButton label="Settings" onClick={go(() => void navigate({ to: "/settings" }))}>
        <SettingsIcon className="size-4" />
      </RailButton>
    </div>
  );
}

const PROVIDER_UPDATE_TONE_CLASSES = {
  loading: "",
  success: "",
  warning: "text-warning hover:text-warning",
  error: "text-destructive hover:text-destructive",
} as const;

/**
 * The provider update notice as a rail icon (the same view the footer pill used):
 * spinner while updating, download when an update is available, check when done,
 * warning on failure. Click opens provider settings; a done notice hides itself.
 */
function RailProviderUpdate() {
  const navigate = useNavigate();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  // Only notices that arrive after the app opened, as in the pill.
  const [visibleAfterIso] = useState(() =>
    providers.reduce<string | undefined>(
      (latest, provider) =>
        latest === undefined || provider.checkedAt > latest ? provider.checkedAt : latest,
      undefined,
    ),
  );
  const view = getProviderUpdateSidebarPillView(providers, {
    ...(visibleAfterIso !== undefined ? { visibleAfterIso } : {}),
    dismissedKeys,
  });
  const viewKey = view?.key;
  const dismissAfterMs = view?.dismissAfterVisibleMs;
  useEffect(() => {
    if (!viewKey || !dismissAfterMs) return;
    const timeout = window.setTimeout(
      () => setDismissedKeys((keys) => new Set(keys).add(viewKey)),
      dismissAfterMs,
    );
    return () => window.clearTimeout(timeout);
  }, [dismissAfterMs, viewKey]);
  if (!view) return null;

  return (
    <RailButton
      label={view.title}
      hint={view.dismissible ? `${view.description} · right-click to dismiss` : view.description}
      className={PROVIDER_UPDATE_TONE_CLASSES[view.tone]}
      onClick={() => void navigate({ to: "/settings/providers" })}
      {...(view.dismissible
        ? { onEdit: () => setDismissedKeys((keys) => new Set(keys).add(view.key)) }
        : {})}
    >
      {view.tone === "loading" ? (
        <Spinner className="size-4" />
      ) : view.tone === "success" ? (
        <CircleCheckIcon className="size-4" />
      ) : view.tone === "error" ? (
        <TriangleAlertIcon className="size-4" />
      ) : (
        <DownloadIcon className="size-4" />
      )}
    </RailButton>
  );
}
