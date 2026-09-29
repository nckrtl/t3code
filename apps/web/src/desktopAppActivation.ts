import type {
  DesktopAppActivationFailure,
  DesktopAppActivationRequest,
  DesktopAppActivationResponse,
  EnvironmentId,
  ExecutionEnvironmentPlatformOs,
  DesktopAppOpenThreadRequest,
  DesktopAppSelectWorkspaceRequest,
  DesktopAppOpenWorkspaceRequest,
  ProjectId,
  ScopedProjectRef,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";

export interface DesktopAppActivationProject {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
}

export interface DesktopAppActivationTarget {
  readonly environmentId: EnvironmentId;
  readonly platform: ExecutionEnvironmentPlatformOs;
}

export interface DesktopAppActivationDependencies {
  readonly getTarget: () => DesktopAppActivationTarget | null;
  readonly findProject: (
    environmentId: EnvironmentId,
    workspaceRoot: string,
  ) => DesktopAppActivationProject | null;
  readonly createProject: (
    environmentId: EnvironmentId,
    workspaceRoot: string,
  ) => Promise<ProjectId>;
  readonly waitForProject: (projectRef: ScopedProjectRef) => Promise<void>;
  readonly openThread: (
    projectRef: ScopedProjectRef,
  ) => Promise<{ readonly threadId: ThreadId } | null>;
  /** The project of an existing thread, or null when the thread isn't known. */
  readonly findThread: (threadRef: ScopedThreadRef) => { readonly projectId: ProjectId } | null;
  readonly showThread: (threadRef: ScopedThreadRef) => Promise<void>;
  /** Selects a workspace by id or name ("all" clears); found is false for unknown names. */
  readonly selectWorkspace: (idOrName: string) => {
    readonly found: boolean;
    readonly workspace: { readonly id: string; readonly name: string } | null;
  };
}

function failure(
  requestId: string,
  code: DesktopAppActivationFailure["code"],
  message: string,
): DesktopAppActivationFailure {
  return { version: 1, requestId, ok: false, code, message };
}

function desktopPlatformToEnvironmentOs(
  platform: DesktopAppOpenWorkspaceRequest["platform"],
): ExecutionEnvironmentPlatformOs {
  return platform === "win32" ? "windows" : platform;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

async function handleOpenThreadRequest(
  request: DesktopAppOpenThreadRequest,
  dependencies: DesktopAppActivationDependencies,
): Promise<DesktopAppActivationResponse> {
  const threadRef = { environmentId: request.environmentId, threadId: request.threadId };
  const thread = dependencies.findThread(threadRef);
  if (thread === null) {
    return failure(
      request.requestId,
      "thread-not-found",
      `T3 Code has no thread ${request.threadId} in environment ${request.environmentId}.`,
    );
  }
  try {
    await dependencies.showThread(threadRef);
  } catch (error) {
    return failure(
      request.requestId,
      "thread-open-failed",
      errorMessage(error, "T3 Code could not show the thread."),
    );
  }
  return {
    version: 1,
    requestId: request.requestId,
    ok: true,
    projectId: thread.projectId,
    threadId: request.threadId,
  };
}

function handleSelectWorkspaceRequest(
  request: DesktopAppSelectWorkspaceRequest,
  dependencies: DesktopAppActivationDependencies,
): DesktopAppActivationResponse {
  const selected = dependencies.selectWorkspace(request.workspace);
  if (!selected.found) {
    return failure(
      request.requestId,
      "workspace-not-found",
      `T3 Code has no single workspace named "${request.workspace}".`,
    );
  }
  return {
    version: 1,
    requestId: request.requestId,
    ok: true,
    workspaceId: selected.workspace?.id ?? null,
    workspaceName: selected.workspace?.name ?? null,
  };
}

export async function handleDesktopAppActivationRequest(
  request: DesktopAppActivationRequest,
  dependencies: DesktopAppActivationDependencies,
): Promise<DesktopAppActivationResponse> {
  if (request.type === "open-thread") return handleOpenThreadRequest(request, dependencies);
  if (request.type === "select-workspace")
    return handleSelectWorkspaceRequest(request, dependencies);

  const target = dependencies.getTarget();
  if (target === null) {
    return failure(
      request.requestId,
      "environment-unavailable",
      "The desktop app's primary local environment is not connected.",
    );
  }

  const requestPlatform = desktopPlatformToEnvironmentOs(request.platform);
  if (requestPlatform !== target.platform) {
    return failure(
      request.requestId,
      "platform-mismatch",
      `The command path is for ${requestPlatform}, but the desktop app's primary environment uses ${target.platform}. Cross-platform path mapping is not supported.`,
    );
  }

  let projectId = dependencies.findProject(target.environmentId, request.workspaceRoot)?.id ?? null;
  if (projectId === null) {
    try {
      projectId = await dependencies.createProject(target.environmentId, request.workspaceRoot);
      await dependencies.waitForProject({ environmentId: target.environmentId, projectId });
    } catch (error) {
      return failure(
        request.requestId,
        "project-create-failed",
        errorMessage(error, "T3 Code could not add the project."),
      );
    }
  }

  try {
    const opened = await dependencies.openThread({
      environmentId: target.environmentId,
      projectId,
    });
    if (opened === null) {
      return failure(
        request.requestId,
        "thread-open-failed",
        "T3 Code could not open a new thread for the project.",
      );
    }
    return {
      version: 1,
      requestId: request.requestId,
      ok: true,
      projectId,
      threadId: opened.threadId,
    };
  } catch (error) {
    return failure(
      request.requestId,
      "thread-open-failed",
      errorMessage(error, "T3 Code could not open a new thread for the project."),
    );
  }
}
