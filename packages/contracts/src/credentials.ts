import { Schema } from "effect";

import { PreviewTabId } from "./preview.ts";

/**
 * Password-manager autofill for the collaborative browser.
 *
 * Agents only ever see item metadata (id, title, saved URLs) and fill
 * statuses. Secret values travel from the password manager CLI to the
 * desktop's CDP session inside trusted app code and never appear in these
 * agent-facing schemas.
 */

export const CredentialField = Schema.Literals(["username", "password", "otp"]);
export type CredentialField = typeof CredentialField.Type;

/** 1Password item ids are 26 lowercase alphanumerics; Bitwarden ids are UUIDs. */
export const CredentialItemId = Schema.String.check(
  Schema.isPattern(
    /^(?:[a-z0-9]{26}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  ),
).annotate({ description: "Item id from request_credentials." });
export type CredentialItemId = typeof CredentialItemId.Type;

export const CredentialItemSummary = Schema.Struct({
  id: CredentialItemId,
  title: Schema.String,
  urls: Schema.Array(Schema.String),
});
export type CredentialItemSummary = typeof CredentialItemSummary.Type;

export const RequestCredentialsInput = Schema.Struct({
  domain: Schema.String.check(Schema.isTrimmed())
    .check(Schema.isNonEmpty())
    .check(Schema.isMaxLength(253))
    .annotate({
      description:
        "Site to sign in to: a host such as github.com, or the full URL of the sign-in page.",
    }),
});
export type RequestCredentialsInput = typeof RequestCredentialsInput.Type;

export const RequestCredentialsResult = Schema.Struct({
  items: Schema.Array(CredentialItemSummary),
});
export type RequestCredentialsResult = typeof RequestCredentialsResult.Type;

export const FillCredentialInput = Schema.Struct({
  itemId: CredentialItemId,
  tabId: Schema.optional(
    PreviewTabId.annotate({
      description: "Browser tab to fill. Omit to use this agent session's current tab.",
    }),
  ),
  field: CredentialField.annotate({
    description: "Which value to fill: username, password, or otp (one-time code).",
  }),
  selector: Schema.optional(
    Schema.String.check(Schema.isNonEmpty()).check(Schema.isMaxLength(512)).annotate({
      description:
        "Optional CSS selector for the input. Omit to let T3 Code find the field for this credential type.",
    }),
  ),
});
export type FillCredentialInput = typeof FillCredentialInput.Type;

/**
 * The only thing an agent learns from a fill. Every value is a fixed token,
 * so no page or password-manager text can ride along.
 */
export const CredentialFillStatus = Schema.Literals([
  "filled",
  "denied",
  "tab_unavailable",
  "origin_mismatch",
  "field_not_found",
  "not_editable",
  "insert_failed",
  "item_not_found",
  "no_value",
  "provider_unavailable",
]);
export type CredentialFillStatus = typeof CredentialFillStatus.Type;

export const FillCredentialResult = Schema.Struct({
  status: CredentialFillStatus,
  message: Schema.String,
});
export type FillCredentialResult = typeof FillCredentialResult.Type;

/** Broker input for the desktop's approval prompt. Holds no secret. */
export const CredentialApprovalRequest = Schema.Struct({
  itemTitle: Schema.String,
  providerLabel: Schema.String,
  origin: Schema.String,
  field: CredentialField,
});
export type CredentialApprovalRequest = typeof CredentialApprovalRequest.Type;

export const CredentialApprovalDecision = Schema.Struct({
  approved: Schema.Boolean,
});
export type CredentialApprovalDecision = typeof CredentialApprovalDecision.Type;

/** Desktop-side outcome of one fill. A subset of CredentialFillStatus. */
export const DesktopCredentialFillStatus = Schema.Literals([
  "filled",
  "origin_mismatch",
  "field_not_found",
  "not_editable",
  "insert_failed",
]);
export type DesktopCredentialFillStatus = typeof DesktopCredentialFillStatus.Type;

export const DesktopCredentialFillResult = Schema.Struct({
  status: DesktopCredentialFillStatus,
});
export type DesktopCredentialFillResult = typeof DesktopCredentialFillResult.Type;
