import {
  CredentialApprovalDecision,
  DesktopCredentialFillResult,
  type CredentialApprovalRequest,
  type CredentialFillStatus,
  type FillCredentialInput,
  type FillCredentialResult,
  type PreviewAutomationError,
  type PreviewAutomationStatus,
  type RequestCredentialsInput,
  type RequestCredentialsResult,
} from "@t3tools/contracts";
import { credentialFieldExpression } from "@t3tools/shared/credentialFill";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as PreviewAutomationBroker from "../mcp/PreviewAutomationBroker.ts";
import * as CredentialProvider from "./CredentialProvider.ts";
import {
  matchingOrigin,
  parseSavedUrl,
  requestedHost,
  savedUrlsMatchHost,
} from "./credentialOrigin.ts";

/** How long the user has to answer the fill prompt before it counts as denied. */
const CREDENTIAL_APPROVAL_TIMEOUT_MS = 90_000;
/** The desktop denies at its own deadline first, so the broker never times out a live host. */
const APPROVAL_BROKER_TIMEOUT_MS = CREDENTIAL_APPROVAL_TIMEOUT_MS + 15_000;

const decodeDecision = Schema.decodeUnknownOption(CredentialApprovalDecision);
const decodeFillResult = Schema.decodeUnknownOption(DesktopCredentialFillResult);

const STATUS_MESSAGES: Record<CredentialFillStatus, string> = {
  filled: "Filled. The value is not shown to you.",
  denied: "The user did not approve this fill. Do not retry unless the user asks.",
  tab_unavailable: "The tab has no page loaded. Open the sign-in page with preview_navigate first.",
  origin_mismatch:
    "The tab's site does not match the item's saved website, so nothing was filled. Navigate to the item's site or ask the user to fix the saved URL.",
  field_not_found:
    "No matching input is visible on the page. Navigate to the sign-in step that shows it, or pass a CSS selector.",
  not_editable: "The input cannot take this value. Passwords only go into masked password inputs.",
  insert_failed: "The page did not accept the value.",
  item_not_found: "No login with this id. Call request_credentials first.",
  no_value: "This item has no value for that field.",
  provider_unavailable: "The password manager is unavailable.",
};

const result = (status: CredentialFillStatus, message = STATUS_MESSAGES[status]) => ({
  status,
  message,
});

export class CredentialAutofill extends Context.Service<
  CredentialAutofill,
  {
    /** Saved logins for a site, as metadata only. */
    readonly request: (
      input: RequestCredentialsInput,
    ) => Effect.Effect<
      RequestCredentialsResult,
      CredentialProvider.CredentialProviderUnavailableError
    >;
    /**
     * Checks the tab's origin against the item, asks the user, then has the
     * desktop insert the value. Returns a status only, never the value.
     */
    readonly fill: (
      scope: McpInvocationContext.McpInvocationScope,
      input: FillCredentialInput,
    ) => Effect.Effect<FillCredentialResult, PreviewAutomationError>;
  }
>()("t3/credentials/CredentialAutofill") {}

const make = Effect.gen(function* () {
  const provider = yield* CredentialProvider.CredentialProvider;
  const broker = yield* PreviewAutomationBroker.PreviewAutomationBroker;

  const request: CredentialAutofill["Service"]["request"] = Effect.fn("CredentialAutofill.request")(
    function* (input) {
      const host = requestedHost(input.domain);
      if (!host) return { items: [] };
      const logins = yield* provider.listLogins;
      return {
        items: logins
          .filter((login) => savedUrlsMatchHost(login.urls, host))
          .map((login) => ({ id: login.id, title: login.title, urls: login.urls })),
      };
    },
  );

  const fill: CredentialAutofill["Service"]["fill"] = Effect.fn("CredentialAutofill.fill")(
    function* (scope, input) {
      const logins = yield* provider.listLogins.pipe(Effect.result);
      if (logins._tag === "Failure") return result("provider_unavailable", logins.failure.message);
      const login = logins.success.find((candidate) => candidate.id === input.itemId);
      if (!login) return result("item_not_found");

      const page = yield* broker.invoke<PreviewAutomationStatus>({
        scope,
        operation: "status",
        input: {},
        updateCurrentTab: false,
        ...(input.tabId === undefined ? {} : { tabId: input.tabId }),
      });
      if (!page.available || !page.url || !page.tabId) return result("tab_unavailable");
      // Pin every later step to the tab whose origin was checked.
      const tabId = page.tabId;
      const origin = matchingOrigin(login.urls, page.url);
      if (!origin) {
        const savedHosts = login.urls.flatMap((url) => parseSavedUrl(url)?.host ?? []);
        return result(
          "origin_mismatch",
          `${STATUS_MESSAGES.origin_mismatch} Saved for: ${savedHosts.join(", ") || "no website"}.`,
        );
      }

      const approvalRequest: CredentialApprovalRequest = {
        itemTitle: login.title,
        providerLabel: provider.label,
        origin,
        field: input.field,
      };
      const decision = yield* broker.invoke<unknown>({
        scope,
        operation: "credentialApproval",
        input: approvalRequest,
        tabId,
        timeoutMs: APPROVAL_BROKER_TIMEOUT_MS,
        updateCurrentTab: false,
      });
      if (Option.getOrUndefined(decodeDecision(decision))?.approved !== true) {
        return result("denied");
      }

      const secret = yield* provider.readSecret(login, input.field).pipe(Effect.result);
      if (secret._tag === "Failure") return result("provider_unavailable", secret.failure.message);
      if (Option.isNone(secret.success)) return result("no_value");

      const filled = yield* broker.invoke<unknown>({
        scope,
        operation: "credentialFill",
        input: {
          field: input.field,
          expectedOrigin: origin,
          fieldExpression: credentialFieldExpression(input.field, input.selector),
          value: Redacted.value(secret.success.value),
        },
        tabId,
        updateCurrentTab: false,
      });
      return result(Option.getOrUndefined(decodeFillResult(filled))?.status ?? "insert_failed");
    },
  );

  return CredentialAutofill.of({ request, fill });
});

export const layer = Layer.effect(CredentialAutofill, make);
