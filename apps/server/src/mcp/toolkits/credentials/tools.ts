import {
  FillCredentialInput,
  FillCredentialResult,
  PreviewAutomationError,
  RequestCredentialsInput,
  RequestCredentialsResult,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as CredentialAutofill from "../../../credentials/CredentialAutofill.ts";
import { CredentialProviderUnavailableError } from "../../../credentials/CredentialProvider.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  CredentialAutofill.CredentialAutofill,
];

const RequestCredentialsTool = Tool.make("request_credentials", {
  description:
    "List the user's saved password-manager logins for a site, to sign in through the collaborative browser. Returns item ids, titles and saved URLs only, never usernames, passwords or codes. Then call fill_credential for each field. Never ask the user to paste a password into the chat.",
  parameters: RequestCredentialsInput,
  success: RequestCredentialsResult,
  failure: Schema.Union([PreviewAutomationError, CredentialProviderUnavailableError]),
  dependencies,
})
  .annotate(Tool.Title, "Find saved logins")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const FillCredentialTool = Tool.make("fill_credential", {
  description:
    "Fill one field of a saved login into the sign-in form in a collaborative browser tab: username, password, or otp (one-time code). The user approves each fill in T3 Code, and the tab must be on the item's saved website. The value goes straight into the page and is never returned to you; you get only a status. Fill username and password as separate calls, then submit the form with preview_click or preview_press.",
  parameters: FillCredentialInput,
  success: FillCredentialResult,
  failure: PreviewAutomationError,
  dependencies,
})
  .annotate(Tool.Title, "Fill saved login")
  .annotate(Tool.OpenWorld, true)
  .annotate(Tool.Destructive, true);

export const CredentialsToolkit = Toolkit.make(RequestCredentialsTool, FillCredentialTool);
