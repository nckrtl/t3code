import * as Schema from "effect/Schema";

import { EnvironmentId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION = 1 as const;

export const DesktopAppActivationPlatform = Schema.Literals(["darwin", "linux", "win32"]);
export type DesktopAppActivationPlatform = typeof DesktopAppActivationPlatform.Type;

export const DesktopAppOpenWorkspaceRequest = Schema.Struct({
  version: Schema.Literal(DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION),
  requestId: TrimmedNonEmptyString,
  type: Schema.Literal("open-workspace"),
  workspaceRoot: TrimmedNonEmptyString,
  platform: DesktopAppActivationPlatform,
});
export type DesktopAppOpenWorkspaceRequest = typeof DesktopAppOpenWorkspaceRequest.Type;

/** Shows an existing thread in the main window. */
export const DesktopAppOpenThreadRequest = Schema.Struct({
  version: Schema.Literal(DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION),
  requestId: TrimmedNonEmptyString,
  type: Schema.Literal("open-thread"),
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type DesktopAppOpenThreadRequest = typeof DesktopAppOpenThreadRequest.Type;

/**
 * Selects a sidebar workspace in the main window (rooms-patches): a workspace
 * id or name, or "all" for every project. A `t3code://workspace/<name>` link
 * does not send this; that link focuses the window already in the workspace.
 */
export const DesktopAppSelectWorkspaceRequest = Schema.Struct({
  version: Schema.Literal(DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION),
  requestId: TrimmedNonEmptyString,
  type: Schema.Literal("select-workspace"),
  workspace: Schema.String,
});
export type DesktopAppSelectWorkspaceRequest = typeof DesktopAppSelectWorkspaceRequest.Type;

export const DesktopAppActivationRequest = Schema.Union([
  DesktopAppOpenWorkspaceRequest,
  DesktopAppOpenThreadRequest,
  DesktopAppSelectWorkspaceRequest,
]);
export type DesktopAppActivationRequest = typeof DesktopAppActivationRequest.Type;

export const DesktopAppActivationErrorCode = Schema.Literals([
  "invalid-request",
  "renderer-unavailable",
  "environment-unavailable",
  "platform-mismatch",
  "project-create-failed",
  "thread-open-failed",
  "thread-not-found",
  "workspace-not-found",
  "request-timeout",
  "internal-error",
]);
export type DesktopAppActivationErrorCode = typeof DesktopAppActivationErrorCode.Type;

export const DesktopAppActivationSuccess = Schema.Struct({
  version: Schema.Literal(DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION),
  requestId: TrimmedNonEmptyString,
  ok: Schema.Literal(true),
  projectId: ProjectId,
  threadId: ThreadId,
});
export type DesktopAppActivationSuccess = typeof DesktopAppActivationSuccess.Type;

export const DesktopAppActivationFailure = Schema.Struct({
  version: Schema.Literal(DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION),
  requestId: TrimmedNonEmptyString,
  ok: Schema.Literal(false),
  code: DesktopAppActivationErrorCode,
  message: TrimmedNonEmptyString,
});
export type DesktopAppActivationFailure = typeof DesktopAppActivationFailure.Type;

/** The workspace now selected; null ids mean all projects. */
export const DesktopAppSelectWorkspaceSuccess = Schema.Struct({
  version: Schema.Literal(DESKTOP_APP_ACTIVATION_PROTOCOL_VERSION),
  requestId: TrimmedNonEmptyString,
  ok: Schema.Literal(true),
  workspaceId: Schema.NullOr(Schema.String),
  workspaceName: Schema.NullOr(Schema.String),
});
export type DesktopAppSelectWorkspaceSuccess = typeof DesktopAppSelectWorkspaceSuccess.Type;

export const DesktopAppActivationResponse = Schema.Union([
  DesktopAppActivationSuccess,
  DesktopAppSelectWorkspaceSuccess,
  DesktopAppActivationFailure,
]);
export type DesktopAppActivationResponse = typeof DesktopAppActivationResponse.Type;
