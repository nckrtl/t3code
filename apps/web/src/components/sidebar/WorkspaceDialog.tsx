import { useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../workspaceStore";
import {
  nextWorkspaceColor,
  WORKSPACE_COLORS,
  type Workspace,
  type WorkspaceColor,
} from "../../workspaces.logic";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { WORKSPACE_COLOR_CLASSES, WORKSPACE_ICONS, WorkspaceBadge } from "./workspaceVisuals";

/**
 * Creates a workspace ("new") or edits one. The caller remounts it (a new
 * `key`) each time it opens, so the form starts from the target.
 */
export function WorkspaceDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: Workspace | "new";
  onClose: () => void;
}) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const availableProjects = useWorkspaceStore((state) => state.availableProjects);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const editing = target === "new" ? null : target;

  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<WorkspaceColor>(
    () => editing?.color ?? nextWorkspaceColor(workspaces),
  );
  const [icon, setIcon] = useState<string | null>(editing?.icon ?? null);
  const [projectKeys, setProjectKeys] = useState<string[]>(() => [...(editing?.projectKeys ?? [])]);
  const [error, setError] = useState<string | null>(null);

  // Projects the workspace has but the sidebar doesn't show now (an environment
  // is offline) stay listed, so saving never drops them silently.
  const projects = useMemo(() => {
    const known = new Set(availableProjects.map((project) => project.projectKey));
    return [
      ...availableProjects,
      ...(editing?.projectKeys ?? [])
        .filter((key) => !known.has(key))
        .map((key) => ({ projectKey: key, displayName: `${key} (not available now)` })),
    ];
  }, [availableProjects, editing]);

  const save = () => {
    const draft = { name, color, icon, projectKeys };
    try {
      if (editing) {
        updateWorkspace(editing.id, draft);
      } else {
        selectWorkspace(createWorkspace(draft).id);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const toggleProject = (key: string, checked: boolean) =>
    setProjectKeys((keys) => (checked ? [...keys, key] : keys.filter((k) => k !== key)));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "New workspace"}</DialogTitle>
          <DialogDescription>
            A workspace shows only the threads of its projects. Workspaces are saved in this app
            only.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="flex items-end gap-3">
              <WorkspaceBadge workspace={{ name: name || "?", color, icon }} className="size-9" />
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="workspace-name">Name</Label>
                <Input
                  id="workspace-name"
                  placeholder="Orbit"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {WORKSPACE_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={option}
                    aria-pressed={color === option}
                    onClick={() => setColor(option)}
                    className={cn(
                      "size-6 rounded-md outline-offset-2",
                      WORKSPACE_COLOR_CLASSES[option],
                      color === option && "outline-2 outline-foreground",
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  aria-pressed={icon === null}
                  onClick={() => setIcon(null)}
                  className={cn(
                    "flex h-7 items-center rounded-md border border-border px-2 text-xs",
                    icon === null && "border-foreground",
                  )}
                >
                  Letter
                </button>
                {Object.entries(WORKSPACE_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    aria-pressed={icon === key}
                    onClick={() => setIcon(key)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md border border-border",
                      icon === key && "border-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Projects</Label>
              {projects.length === 0 ? (
                <p className="text-muted-foreground text-sm">No projects yet.</p>
              ) : (
                <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-2">
                  {projects.map((project) => {
                    const id = `workspace-project-${project.projectKey}`;
                    return (
                      <div key={project.projectKey} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={projectKeys.includes(project.projectKey)}
                          onCheckedChange={(checked) =>
                            toggleProject(project.projectKey, checked === true)
                          }
                        />
                        <Label htmlFor={id}>
                          <span className="truncate">{project.displayName}</span>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          {editing ? (
            <Button
              variant="destructive-outline"
              className="mr-auto"
              onClick={() => {
                deleteWorkspace(editing.id);
                onClose();
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
